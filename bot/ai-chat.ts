import { type Client, cleanContent, type Message } from 'discord.js'

import {
  aiChatConfigured,
  type ChatTurn,
  generateReply,
  splitForDiscord,
} from '#/lib/ai-chat.ts'

import { aiChatSettingsFor } from './config-cache.ts'
import { logActivity, logError } from './log.ts'

// Members talk to the bot by @mentioning it (or its role) or by replying to
// one of its messages. A reply chain is the conversation: the bot reads back
// up to REPLY_CHAIN_LIMIT messages so follow-up questions have context.

const REPLY_CHAIN_LIMIT = 10
const TYPING_REFRESH_MS = 8_000

// guildId:userId -> time the cooldown ends
const cooldowns = new Map<string, number>()

function pruneCooldowns(now: number) {
  for (const [key, until] of cooldowns) {
    if (until <= now) cooldowns.delete(key)
  }
}
setInterval(() => pruneCooldowns(Date.now()), 10 * 60_000).unref()

/** Message text without the bot's own mention, with other mentions as names. */
function textOf(message: Message, botId: string, botRoleId?: string) {
  let raw = message.content.replaceAll(`<@${botId}>`, '').replaceAll(`<@!${botId}>`, '')
  if (botRoleId) raw = raw.replaceAll(`<@&${botRoleId}>`, '')
  const text = cleanContent(raw, message.channel).trim()
  if (text) return text
  // Embed-only messages (e.g. scheduled announcements) still give context.
  const embed = message.embeds[0]
  return [embed?.title, embed?.description].filter(Boolean).join('\n')
}

function authorName(message: Message) {
  return message.member?.displayName ?? message.author.displayName
}

/** The replied-to messages, oldest first, ending with `start`. */
async function replyChain(start: Message | null) {
  const chain: Message[] = []
  let current = start
  while (current && chain.length < REPLY_CHAIN_LIMIT) {
    chain.unshift(current)
    if (!current.reference?.messageId) break
    current = await current.fetchReference().catch(() => null)
  }
  return chain
}

/**
 * Answers the message with Gemini if it's addressed to the bot. Returns true
 * when it was (so auto-responders skip it), even if a cooldown suppressed it.
 */
export async function handleAiChat(client: Client<true>, message: Message<true>) {
  const settings = aiChatSettingsFor(message.guildId)
  if (!settings.enabled || !aiChatConfigured()) return false

  const botId = client.user.id
  const botRoleId = message.guild.members.me?.roles.botRole?.id
  const referenced = message.reference?.messageId
    ? await message.fetchReference().catch(() => null)
    : null
  const addressed =
    message.mentions.users.has(botId) ||
    (!!botRoleId && message.mentions.roles.has(botRoleId)) ||
    referenced?.author.id === botId
  if (!addressed) return false

  const key = `${message.guildId}:${message.author.id}`
  const now = Date.now()
  if ((cooldowns.get(key) ?? 0) > now) {
    await message.react('⏳').catch(() => {})
    return true
  }
  cooldowns.set(key, now + settings.cooldownSeconds * 1000)

  // Discord shows "typing…" for ~10s per call, so keep it alive while waiting.
  await message.channel.sendTyping().catch(() => {})
  const typing = setInterval(() => {
    message.channel.sendTyping().catch(() => {})
  }, TYPING_REFRESH_MS)

  const started = Date.now()
  try {
    const history = await replyChain(referenced)
    const turns: ChatTurn[] = [...history, message].map((m) => ({
      fromBot: m.author.id === botId,
      author: authorName(m),
      content: textOf(m, botId, botRoleId) || '(said hi without a message)',
    }))
    const { text, model } = await generateReply(turns, {
      botName: message.guild.members.me?.displayName ?? client.user.username,
      server: message.guild.name,
      channel: 'name' in message.channel ? message.channel.name : undefined,
      persona: settings.persona,
    })
    clearInterval(typing)

    const [first, ...rest] = splitForDiscord(text || "I'd rather not answer that one.")
    // The reply may ping the person asking; nothing in the answer can ping anyone.
    await message.reply({ content: first, allowedMentions: { parse: [], repliedUser: true } })
    for (const part of rest) {
      await message.channel.send({ content: part, allowedMentions: { parse: [] } })
    }
    // The cooldown runs from the answer, not the question (answers can take a while).
    cooldowns.set(key, Date.now() + settings.cooldownSeconds * 1000)

    await logActivity({
      guildId: message.guildId,
      type: 'ai_reply',
      name: textOf(message, botId, botRoleId).slice(0, 100) || '(mention)',
      userId: message.author.id,
      channelId: message.channelId,
      metadata: {
        username: message.author.username,
        model,
        ms: Date.now() - started,
        replyLength: text.length,
      },
    })
  } catch (error) {
    clearInterval(typing)
    // A failed answer shouldn't count against the member's cooldown.
    cooldowns.delete(key)
    await logError(message.guildId, 'ai_chat', error, { channelId: message.channelId })
    await message
      .reply({
        content: "Sorry, I couldn't come up with an answer just now. Try again in a moment.",
        allowedMentions: { parse: [], repliedUser: false },
      })
      .catch(() => {})
  }
  return true
}
