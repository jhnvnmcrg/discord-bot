import type { CommandEmbed } from '../db/schema.ts'
import { renderTemplate, type TemplateVars } from './templates.ts'

// Builds Discord message JSON from a stored text/embed reply. The shape is the
// Discord API's, which discord.js also accepts, so the bot and the web app
// (Send now, over REST) produce identical messages.

export type StoredReply = {
  responseType: 'text' | 'embed'
  content: string
  embed: CommandEmbed | null
}

export type MessagePayload = {
  content?: string
  embeds?: { title?: string; description?: string; color?: number }[]
}

export function buildMessagePayload(
  reply: StoredReply,
  vars: TemplateVars,
): MessagePayload {
  if (reply.responseType === 'embed' && reply.embed) {
    const title = renderTemplate(reply.embed.title ?? '', vars).trim()
    const description = renderTemplate(reply.embed.description ?? '', vars).trim()
    const color = reply.embed.color
      ? Number.parseInt(reply.embed.color.slice(1), 16)
      : undefined
    return {
      embeds: [
        {
          title: title ? title.slice(0, 256) : undefined,
          description: description ? description.slice(0, 4096) : undefined,
          color: Number.isNaN(color) ? undefined : color,
        },
      ],
    }
  }
  return { content: renderTemplate(reply.content, vars).slice(0, 2000) }
}

/**
 * Whether a member mention has to be added in front of the message: always
 * for embeds (mentions inside embeds never ping), and for text that doesn't
 * place {user} itself.
 */
export function mentionGoesFirst(reply: StoredReply) {
  return reply.responseType === 'embed' || !reply.content.includes('{user}')
}

/** Adds a pinging mention of `userId` to the message's content. */
export function withMention(
  payload: MessagePayload,
  reply: StoredReply,
  userId: string,
): MessagePayload {
  if (!mentionGoesFirst(reply)) return payload
  const mention = `<@${userId}>`
  const content = payload.content ? `${mention} ${payload.content}` : mention
  return { ...payload, content: content.slice(0, 2000) }
}
