import { eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import {
  activityLog,
  type Guild,
  type ScheduledMessage,
  scheduledMessages,
} from '#/db/schema.ts'
import { MESSAGE_CHANNEL_TYPES } from '#/lib/discord.ts'
import { buildMessagePayload } from '#/lib/message-payload.ts'
import { computeNextRun } from '#/lib/schedule.ts'
import type { ScheduledMessageInput } from '#/lib/schemas.ts'

import { DiscordApiError, discordPost, getChannel } from './discord.server'

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
    await discordPost(`/channels/${row.channelId}/messages`, {
      ...buildMessagePayload(row, {
        server: guild.name,
        memberCount: String(guild.memberCount),
        channel: `<#${row.channelId}>`,
      }),
      allowed_mentions: { parse: [] },
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
