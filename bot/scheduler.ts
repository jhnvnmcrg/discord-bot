import { type Client, type Guild, PermissionFlagsBits } from 'discord.js'
import { and, asc, eq, inArray, lte } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import {
  type MentionTarget,
  type ScheduledMessage,
  scheduledMessages,
} from '#/db/schema.ts'
import { asMentionTarget } from '#/lib/mentions.ts'
import { buildPingedPayload, type ResolvedPing } from '#/lib/message-payload.ts'
import {
  computeNextRun,
  MISSED_AFTER_MS,
  SCHEDULER_TICK_MS,
} from '#/lib/schedule.ts'

import { logActivity, logError } from './log.ts'
import { deliverDueReminders } from './reminders.ts'

const BATCH_SIZE = 25

type Claimed = { row: ScheduledMessage; missed: boolean }

/**
 * Takes the due messages and moves each one's next_run_at forward in a single
 * transaction. FOR UPDATE SKIP LOCKED means two bot instances never claim the
 * same row, so a message is sent at most once. Runs that are more than
 * MISSED_AFTER_MS late (the bot was offline) are skipped, not sent late.
 */
async function claimDue(guildIds: string[], now: Date): Promise<Claimed[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(scheduledMessages)
      .where(
        and(
          eq(scheduledMessages.enabled, true),
          lte(scheduledMessages.nextRunAt, now),
          inArray(scheduledMessages.guildId, guildIds),
        ),
      )
      .orderBy(asc(scheduledMessages.nextRunAt))
      .limit(BATCH_SIZE)
      .for('update', { skipLocked: true })

    const claimed: Claimed[] = []
    for (const row of due) {
      const dueAt = row.nextRunAt?.getTime() ?? now.getTime()
      const missed = now.getTime() - dueAt > MISSED_AFTER_MS
      await tx
        .update(scheduledMessages)
        .set({
          // Computed from now, so a long outage skips every missed run at once.
          // A one-time message is finished after its single run, sent or not.
          nextRunAt:
            row.schedule.type === 'once'
              ? null
              : computeNextRun(row.schedule, row.timezone, now),
          ...(missed
            ? { lastRunAt: now, lastResult: 'missed' as const, lastError: null }
            : {}),
        })
        .where(eq(scheduledMessages.id, row.id))
      claimed.push({ row, missed })
    }
    return claimed
  })
}

/** A saved ping, checked against the bot's view of the server right now. */
async function resolvePing(
  guild: Guild,
  target: MentionTarget | null,
): Promise<ResolvedPing | undefined> {
  if (!target) return undefined
  if (target.type === 'everyone' || target.type === 'here') return target
  if (target.type === 'member') {
    const member = await guild.members.fetch(target.id).catch(() => null)
    return {
      type: 'member',
      id: target.id,
      displayName: member?.displayName ?? target.displayName,
      present: !!member,
    }
  }
  const role = guild.roles.cache.get(target.id)
  return { type: 'role', id: target.id, name: role?.name ?? target.name, present: !!role }
}

/** Sends the message; returns why Discord will drop the ping, if it will. */
async function send(client: Client<true>, row: ScheduledMessage) {
  const guild = client.guilds.cache.get(row.guildId)
  const channel = guild?.channels.cache.get(row.channelId)
  if (!guild || !channel?.isSendable()) {
    throw new Error('The channel is missing or the bot cannot post there.')
  }
  const ping = await resolvePing(guild, asMentionTarget(row.mention))
  const { payload, allowedMentions } = buildPingedPayload(
    row,
    {
      server: guild.name,
      memberCount: String(guild.memberCount),
      channel: `<#${channel.id}>`,
    },
    ping,
  )
  // Nothing but the chosen ping can go through: allowedMentions lists only it.
  await channel.send({ ...payload, allowedMentions })

  // @everyone, @here and unmentionable roles need Mention Everyone in the channel;
  // without it Discord posts the message but silently skips the ping.
  const me = guild.members.me
  const canMentionAll = !!me && !!channel.permissionsFor(me)?.has(PermissionFlagsBits.MentionEveryone)
  const needsPermission =
    ping?.type === 'everyone' ||
    ping?.type === 'here' ||
    (ping?.type === 'role' && ping.present && !guild.roles.cache.get(ping.id)?.mentionable)
  return needsPermission && !canMentionAll
    ? 'Sent, but the ping was skipped: the bot needs "Mention @everyone, @here, and All Roles" in this channel.'
    : undefined
}

async function recordResult(
  row: ScheduledMessage,
  now: Date,
  result: 'sent' | 'failed',
  /** The error for a failure, or a note on a send (e.g. a skipped ping). */
  detail?: unknown,
) {
  await db
    .update(scheduledMessages)
    .set({
      lastRunAt: now,
      lastResult: result,
      lastError:
        detail instanceof Error ? detail.message : typeof detail === 'string' ? detail : null,
    })
    .where(eq(scheduledMessages.id, row.id))
}

async function tick(client: Client<true>) {
  const guildIds = [...client.guilds.cache.keys()]
  if (guildIds.length === 0) return
  const now = new Date()

  await deliverDueReminders(client, guildIds, now)

  for (const { row, missed } of await claimDue(guildIds, now)) {
    const base = {
      guildId: row.guildId,
      type: 'scheduled' as const,
      name: row.name,
      channelId: row.channelId,
    }
    if (missed) {
      await logActivity({
        ...base,
        metadata: {
          status: 'missed',
          scheduleId: row.id,
          dueAt: row.nextRunAt?.toISOString(),
        },
      })
      continue
    }
    try {
      const pingSkipped = await send(client, row)
      await recordResult(row, now, 'sent', pingSkipped)
      await logActivity({
        ...base,
        metadata: { status: 'sent', scheduleId: row.id, ...(pingSkipped ? { pingSkipped: true } : {}) },
      })
    } catch (error) {
      await recordResult(row, now, 'failed', error).catch(() => {})
      await logError(row.guildId, 'scheduled', error, {
        schedule: row.name,
        channelId: row.channelId,
      })
    }
  }
}

/** Sends due reminders and scheduled messages every SCHEDULER_TICK_MS. Returns a stop function. */
export function startScheduler(client: Client<true>) {
  let running = false
  const run = async () => {
    if (running) return // a slow tick must not overlap the next one
    running = true
    try {
      await tick(client)
    } catch (error) {
      console.error('Scheduler tick failed', error)
    } finally {
      running = false
    }
  }
  void run()
  const timer = setInterval(run, SCHEDULER_TICK_MS)
  return () => clearInterval(timer)
}
