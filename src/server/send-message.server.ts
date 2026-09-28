import { db } from '#/db/index.ts'
import { activityLog, type Guild } from '#/db/schema.ts'
import type { SentMessage } from '#/lib/api-types.ts'
import { MESSAGE_CHANNEL_TYPES } from '#/lib/discord.ts'
import { buildMessagePayload, withMention } from '#/lib/message-payload.ts'
import type { SendMessageInput } from '#/lib/schemas.ts'

import {
  DiscordApiError,
  discordPost,
  getChannel,
  getMember,
  openDm,
} from './discord.server'

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
    const { channelId, mentionUserId } = input.target
    const channel = await getChannel(channelId)
    const types: readonly number[] = MESSAGE_CHANNEL_TYPES
    if (channel.guild_id !== guild.id || !types.includes(channel.type)) {
      throw new DiscordApiError(400, 'That channel is not a text channel in this server.')
    }
    const mentioned = mentionUserId ? await getMember(guild.id, mentionUserId) : undefined
    if (mentionUserId && !mentioned) {
      throw new DiscordApiError(400, 'The member to mention is not in this server.')
    }

    const payload = buildMessagePayload(input, {
      server: guild.name,
      memberCount: String(guild.memberCount),
      channel: `<#${channelId}>`,
      ...(mentioned
        ? { user: `<@${mentioned.id}>`, 'user.name': mentioned.displayName }
        : {}),
    })
    const message = await discordPost<{ id: string }>(`/channels/${channelId}/messages`, {
      ...(mentioned ? withMention(payload, input, mentioned.id) : payload),
      // Only the chosen member is pinged; @everyone and other mentions stay text.
      allowed_mentions: mentioned ? { users: [mentioned.id] } : { parse: [] },
    })
    const url = `https://discord.com/channels/${guild.id}/${channelId}/${message.id}`
    await db.insert(activityLog).values({
      guildId: guild.id,
      type: 'message',
      name: preview,
      channelId,
      userId: mentioned?.id,
      metadata: {
        target: 'channel',
        url,
        sentBy,
        ...(mentioned ? { mentioned: mentioned.username } : {}),
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
