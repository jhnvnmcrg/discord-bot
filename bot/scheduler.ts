import type { Client } from 'discord.js'
import { and, asc, eq, inArray, lte } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { type ScheduledMessage, scheduledMessages } from '#/db/schema.ts'
import { buildScheduledPayload } from '#/lib/message-payload.ts'
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

async function send(client: Client<true>, row: ScheduledMessage) {
  const guild = client.guilds.cache.get(row.guildId)
  const channel = guild?.channels.cache.get(row.channelId)
  if (!guild || !channel?.isSendable()) {
    throw new Error('The channel is missing or the bot cannot post there.')
  }
  // The chosen member is pinged only while they're still in the server.
  const member = row.mention
    ? await guild.members.fetch(row.mention.id).catch(() => null)
    : null
  const { payload, pingUserIds } = buildScheduledPayload(
    row,
    { server: guild.name, memberCount: String(guild.memberCount) },
    member
      ? { id: member.id, displayName: member.displayName, present: true }
      : row.mention
        ? { ...row.mention, present: false }
        : undefined,
  )
  await channel.send({
    ...payload,
    // Nothing else ever pings: no @everyone, @here, roles or other users.
    allowedMentions: { users: pingUserIds },
  })
}

async function recordResult(
  row: ScheduledMessage,
  now: Date,
  result: 'sent' | 'failed',
  error?: unknown,
) {
  await db
    .update(scheduledMessages)
    .set({
      lastRunAt: now,
      lastResult: result,
      lastError: error instanceof Error ? error.message : null,
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
      await send(client, row)
      await recordResult(row, now, 'sent')
      await logActivity({ ...base, metadata: { status: 'sent', scheduleId: row.id } })
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
