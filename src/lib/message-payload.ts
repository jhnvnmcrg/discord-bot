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
