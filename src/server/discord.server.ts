import type { ChannelOption, RoleOption } from '#/lib/api-types.ts'
import { MESSAGE_CHANNEL_TYPES } from '#/lib/discord.ts'

const API = 'https://discord.com/api/v10'

export class DiscordApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function discordRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  const token = process.env.DISCORD_TOKEN
  if (!token) throw new DiscordApiError(500, 'DISCORD_TOKEN is not set.')
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    // Discord explains failures like "Missing Permissions" in `message`.
    const detail = (await response.json().catch(() => undefined)) as
      | { message?: string }
      | undefined
    throw new DiscordApiError(
      response.status,
      detail?.message
        ? `Discord said: ${detail.message}`
        : `Discord returned ${response.status} for ${path}.`,
    )
  }
  return response.json() as Promise<T>
}

const discordGet = <T>(path: string) => discordRequest<T>('GET', path)

export const discordPost = <T>(path: string, body: unknown) =>
  discordRequest<T>('POST', path, body)

export function getChannel(channelId: string) {
  return discordGet<{ id: string; guild_id?: string; type: number }>(
    `/channels/${channelId}`,
  )
}

type RawChannel = {
  id: string
  name: string
  type: number
  position: number
  parent_id: string | null
}

type RawRole = {
  id: string
  name: string
  color: number
  position: number
  managed: boolean
}

export async function listMessageChannels(
  guildId: string,
): Promise<ChannelOption[]> {
  const channels = await discordGet<RawChannel[]>(`/guilds/${guildId}/channels`)
  const categories = new Map(
    channels.filter((c) => c.type === 4).map((c) => [c.id, c]),
  )
  const types: readonly number[] = MESSAGE_CHANNEL_TYPES
  return channels
    .filter((c) => types.includes(c.type))
    .sort((a, b) => {
      const pa = a.parent_id ? (categories.get(a.parent_id)?.position ?? 0) : -1
      const pb = b.parent_id ? (categories.get(b.parent_id)?.position ?? 0) : -1
      return pa - pb || a.position - b.position
    })
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      parentName: c.parent_id
        ? (categories.get(c.parent_id)?.name ?? null)
        : null,
    }))
}

let botUserId: string | undefined

export async function listRoles(guildId: string): Promise<RoleOption[]> {
  botUserId ??= (await discordGet<{ id: string }>('/users/@me')).id
  const [roles, member] = await Promise.all([
    discordGet<RawRole[]>(`/guilds/${guildId}/roles`),
    discordGet<{ roles: string[] }>(`/guilds/${guildId}/members/${botUserId}`),
  ])
  const positions = new Map(roles.map((r) => [r.id, r.position]))
  const botTop = Math.max(0, ...member.roles.map((id) => positions.get(id) ?? 0))

  return roles
    .filter((r) => !r.managed && r.id !== guildId) // skip bot roles and @everyone
    .sort((a, b) => b.position - a.position)
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      assignable: r.position < botTop,
    }))
}
