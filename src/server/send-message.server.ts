import { db } from '#/db/index.ts'
import { activityLog, type Guild } from '#/db/schema.ts'
import type { SentMessage } from '#/lib/api-types.ts'
import { MESSAGE_CHANNEL_TYPES } from '#/lib/discord.ts'
import { mentionLabel } from '#/lib/mentions.ts'
import {
  buildMessagePayload,
  buildPingedPayload,
  type ResolvedPing,
} from '#/lib/message-payload.ts'
import { requestedMention, type SendMessageInput } from '#/lib/schemas.ts'

import {
  DiscordApiError,
  discordPost,
  getChannel,
  getMember,
  openDm,
} from './discord.server'
import { resolveMentionTarget } from './scheduled.server'

// Discord's JSON error code when a user doesn't accept DMs from the bot.
const CANNOT_DM = 'Cannot send messages to this user'

/**
 * Sends a dashboard-composed message as the bot, over Discord's REST API.
 * Targets are checked against the guild first: the channel must be one of its
 * text channels, and a DM recipient (or a member to mention) must be one of
 * its members. The only possible ping is the member chosen to be mentioned.
 */
export async function sendMessageNow(
  input: SendMessageInput,
  guild: Guild,
  sentBy: string | null,
): Promise<SentMessage> {
  const preview = (input.responseType === 'embed'
    ? input.embed?.title || input.embed?.description
    : input.content
  )
    ?.trim()
    .slice(0, 100)

  if (input.target.type === 'channel') {
    const { channelId } = input.target
    const channel = await getChannel(channelId)
    const types: readonly number[] = MESSAGE_CHANNEL_TYPES
    if (channel.guild_id !== guild.id || !types.includes(channel.type)) {
      throw new DiscordApiError(400, 'That channel is not a text channel in this server.')
    }
    // The requested ping is checked against the server before anything is sent.
    const target = await resolveMentionTarget(guild.id, requestedMention(input.target) ?? null)
    // Just checked, so a member or role here exists.
    const ping: ResolvedPing | undefined =
      target?.type === 'member'
        ? { type: 'member', id: target.id, displayName: target.displayName, present: true }
        : target?.type === 'role'
          ? { type: 'role', id: target.id, name: target.name, present: true }
          : (target ?? undefined)
    const { payload, allowedMentions } = buildPingedPayload(
      input,
      { server: guild.name, memberCount: String(guild.memberCount), channel: `<#${channelId}>` },
      ping,
    )
    const message = await discordPost<{ id: string }>(`/channels/${channelId}/messages`, {
      ...payload,
      // Only the chosen ping goes through; @everyone and other mentions stay text.
      allowed_mentions: allowedMentions,
    })
    const url = `https://discord.com/channels/${guild.id}/${channelId}/${message.id}`
    await db.insert(activityLog).values({
      guildId: guild.id,
      type: 'message',
      name: preview,
      channelId,
      userId: target?.type === 'member' ? target.id : undefined,
      metadata: {
        target: 'channel',
        url,
        sentBy,
        ...(target ? { mentioned: mentionLabel(target).slice(1), pingType: target.type } : {}),
      },
    })
    return { url }
  }

  const member = await getMember(guild.id, input.target.userId)
  if (!member) throw new DiscordApiError(400, 'That person is not a member of this server.')

  try {
    const dmChannelId = await openDm(member.id)
    await discordPost(`/channels/${dmChannelId}/messages`, {
      ...buildMessagePayload(input, {
        user: `<@${member.id}>`,
        'user.name': member.displayName,
        server: guild.name,
        memberCount: String(guild.memberCount),
      }),
      allowed_mentions: { parse: [] },
    })
  } catch (error) {
    if (error instanceof DiscordApiError && error.message.includes(CANNOT_DM)) {
      throw new DiscordApiError(
        400,
        `${member.displayName} doesn't accept DMs from this bot (their privacy settings block it).`,
      )
    }
    throw error
  }

  await db.insert(activityLog).values({
    guildId: guild.id,
    type: 'message',
    name: preview,
    userId: member.id,
    metadata: { target: 'dm', username: member.username, sentBy },
  })
  return { url: null }
}
