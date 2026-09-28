import { eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import {
  activityLog,
  type Guild,
  type MentionSnapshot,
  type ScheduledMessage,
  scheduledMessages,
} from '#/db/schema.ts'
import { MESSAGE_CHANNEL_TYPES } from '#/lib/discord.ts'
import { buildScheduledPayload } from '#/lib/message-payload.ts'
import { computeNextRun } from '#/lib/schedule.ts'
import type { ScheduledMessageInput } from '#/lib/schemas.ts'

import {
  DiscordApiError,
  discordPost,
  getChannel,
  getMember,
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
 * The member a scheduled message will ping, checked against the server.
 * An unchanged mention is kept as saved, without asking Discord again.
 */
export async function resolveMention(
  guildId: string,
  mentionUserId: string | null | undefined,
  saved?: MentionSnapshot | null,
): Promise<MentionSnapshot | null> {
  if (!mentionUserId) return null
  if (saved?.id === mentionUserId) return saved
  const member = await getMember(guildId, mentionUserId)
  if (!member) throw new DiscordApiError(400, 'The member to mention is not in this server.')
  return member
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
    // Ping the member only if they're still in the server.
    const mentioned = row.mention ? await getMember(guild.id, row.mention.id) : undefined
    const { payload, pingUserIds } = buildScheduledPayload(
      row,
      { server: guild.name, memberCount: String(guild.memberCount) },
      mentioned
        ? { ...mentioned, present: true }
        : row.mention
          ? { ...row.mention, present: false }
          : undefined,
    )
    await discordPost(`/channels/${row.channelId}/messages`, {
      ...payload,
      allowed_mentions: { users: pingUserIds },
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
