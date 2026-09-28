import { eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import {
  activityLog,
  type Guild,
  type MentionTarget,
  type ScheduledMessage,
  scheduledMessages,
} from '#/db/schema.ts'
import { MESSAGE_CHANNEL_TYPES } from '#/lib/discord.ts'
import { asMentionTarget } from '#/lib/mentions.ts'
import { buildPingedPayload, type ResolvedPing } from '#/lib/message-payload.ts'
import { computeNextRun } from '#/lib/schedule.ts'
import type { MentionInput, ScheduledMessageInput } from '#/lib/schemas.ts'

import {
  DiscordApiError,
  discordPost,
  getChannel,
  getMember,
  getRole,
} from './discord.server'

export const MAX_SCHEDULES_PER_GUILD = 50

/** When the message should next go out given what was just saved. */
export function planNextRun(input: ScheduledMessageInput, now = new Date()) {
  return input.enabled ? computeNextRun(input.schedule, input.timezone, now) : null
}

/** A one-time message must be saved with a time that is still ahead. */
export function isPastOneTime(input: ScheduledMessageInput, now = new Date()) {
  return (
    input.schedule.type === 'once' &&
    computeNextRun(input.schedule, input.timezone, now) === null
  )
}

/**
 * Turns a requested ping into what gets saved, checking members and roles
 * against the server. `undefined` keeps `saved`; an unchanged member or role
 * is kept as saved without asking Discord again.
 */
export async function resolveMentionTarget(
  guildId: string,
  requested: MentionInput | null | undefined,
  saved?: MentionTarget | null,
): Promise<MentionTarget | null> {
  if (requested === undefined) return saved ?? null
  if (requested === null) return null
  switch (requested.type) {
    case 'everyone':
    case 'here':
      return { type: requested.type }
    case 'member': {
      if (saved?.type === 'member' && saved.id === requested.userId) return saved
      const member = await getMember(guildId, requested.userId)
      if (!member) throw new DiscordApiError(400, 'The member to mention is not in this server.')
      return { type: 'member', ...member }
    }
    case 'role': {
      if (saved?.type === 'role' && saved.id === requested.roleId) return saved
      const role = await getRole(guildId, requested.roleId)
      if (!role) throw new DiscordApiError(400, 'That role does not exist in this server.')
      return { type: 'role', ...role }
    }
  }
}

/** Checks a saved ping against the server right before sending, over REST. */
export async function resolvePingNow(
  guildId: string,
  target: MentionTarget | null,
): Promise<ResolvedPing | undefined> {
  if (!target) return undefined
  if (target.type === 'everyone' || target.type === 'here') return target
  if (target.type === 'member') {
    const member = await getMember(guildId, target.id)
    return {
      type: 'member',
      id: target.id,
      displayName: member?.displayName ?? target.displayName,
      present: !!member,
    }
  }
  const role = await getRole(guildId, target.id)
  return { type: 'role', id: target.id, name: role?.name ?? target.name, present: !!role }
}

/**
 * Posts a scheduled message right away over Discord's REST API (so it works
 * while the bot is offline) and records the result like a scheduled run would.
 * Does not change when the message next runs.
 */
export async function sendScheduledNow(row: ScheduledMessage, guild: Guild) {
  const now = new Date()
  try {
    // The channel id is user input: make sure it belongs to this server.
    const channel = await getChannel(row.channelId)
    const types: readonly number[] = MESSAGE_CHANNEL_TYPES
    if (channel.guild_id !== guild.id || !types.includes(channel.type)) {
      throw new DiscordApiError(400, 'That channel is not a text channel in this server.')
    }
    // Ping only a member or role that still exists; otherwise name it as text.
    const ping = await resolvePingNow(guild.id, asMentionTarget(row.mention))
    const { payload, allowedMentions } = buildPingedPayload(
      row,
      {
        server: guild.name,
        memberCount: String(guild.memberCount),
        channel: `<#${row.channelId}>`,
      },
      ping,
    )
    await discordPost(`/channels/${row.channelId}/messages`, {
      ...payload,
      allowed_mentions: allowedMentions,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(scheduledMessages)
      .set({ lastRunAt: now, lastResult: 'failed', lastError: message })
      .where(eq(scheduledMessages.id, row.id))
    throw error
  }

  const [updated] = await db
    .update(scheduledMessages)
    .set({ lastRunAt: now, lastResult: 'sent', lastError: null })
    .where(eq(scheduledMessages.id, row.id))
    .returning()
  await db.insert(activityLog).values({
    guildId: guild.id,
    type: 'scheduled',
    name: row.name,
    channelId: row.channelId,
    metadata: { status: 'sent', scheduleId: row.id, manual: true },
  })
  return updated
}
