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

// Pings. Discord only pings what `allowed_mentions` lists, so a message can
// contain "@everyone" or other mentions as plain text while pinging exactly
// one chosen target.

/** A ping resolved at send time; members and roles say whether they still exist. */
export type ResolvedPing =
  | { type: 'member'; id: string; displayName: string; present: boolean }
  | { type: 'role'; id: string; name: string; present: boolean }
  | { type: 'everyone' }
  | { type: 'here' }

export type PingType = ResolvedPing['type']

export type AllowedMentions = {
  parse: 'everyone'[]
  users: string[]
  roles: string[]
}

export const NO_PINGS: AllowedMentions = { parse: [], users: [], roles: [] }

/** Live mention markup, or the name as plain text once the member or role is gone. */
export function pingText(ping: ResolvedPing) {
  switch (ping.type) {
    case 'member':
      return ping.present ? `<@${ping.id}>` : `@${ping.displayName}`
    case 'role':
      return ping.present ? `<@&${ping.id}>` : `@${ping.name}`
    case 'everyone':
      return '@everyone'
    case 'here':
      return '@here'
  }
}

function isLive(ping: ResolvedPing) {
  return ping.type === 'everyone' || ping.type === 'here' || ping.present
}

/**
 * Whether the ping is added in front of the message: always for embeds
 * (mentions inside embeds never ping), and for text that doesn't place it
 * with {ping} (or {user}, for a member).
 */
export function pingGoesFirst(reply: StoredReply, type: PingType) {
  if (reply.responseType === 'embed') return true
  if (reply.content.includes('{ping}')) return false
  return !(type === 'member' && reply.content.includes('{user}'))
}

/** Builds the message and the allowed_mentions that let only `ping` through. */
export function buildPingedPayload(
  reply: StoredReply,
  vars: TemplateVars,
  ping?: ResolvedPing,
): { payload: MessagePayload; allowedMentions: AllowedMentions } {
  if (!ping) return { payload: buildMessagePayload(reply, vars), allowedMentions: NO_PINGS }

  const text = pingText(ping)
  const base = buildMessagePayload(reply, {
    ...vars,
    ping: text,
    ...(ping.type === 'member' ? { user: text, 'user.name': ping.displayName } : {}),
  })
  const live = isLive(ping)
  const payload =
    live && pingGoesFirst(reply, ping.type)
      ? { ...base, content: (base.content ? `${text} ${base.content}` : text).slice(0, 2000) }
      : base
  return {
    payload,
    allowedMentions: {
      parse: live && (ping.type === 'everyone' || ping.type === 'here') ? ['everyone'] : [],
      users: live && ping.type === 'member' ? [ping.id] : [],
      roles: live && ping.type === 'role' ? [ping.id] : [],
    },
  }
}
