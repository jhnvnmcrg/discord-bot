import type { ChannelOption, MemberOption, RoleOption } from '#/lib/api-types.ts'
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

type Overwrite = { id: string; type: 0 | 1; allow: string; deny: string }

type RawChannel = {
  id: string
  name: string
  type: number
  position: number
  parent_id: string | null
  permission_overwrites?: Overwrite[]
}

type RawRole = {
  id: string
  name: string
  color: number
  position: number
  managed: boolean
  mentionable: boolean
  permissions: string
}

const ADMINISTRATOR = 1n << 3n
const MENTION_EVERYONE = 1n << 17n

let botUserId: string | undefined

/** The guild's roles plus the bot's own member entry, fetched together. */
async function rolesAndBot(guildId: string) {
  botUserId ??= (await discordGet<{ id: string }>('/users/@me')).id
  const [roles, member] = await Promise.all([
    discordGet<RawRole[]>(`/guilds/${guildId}/roles`),
    discordGet<{ roles: string[] }>(`/guilds/${guildId}/members/${botUserId}`),
  ])
  return { roles, botRoleIds: new Set(member.roles), botId: botUserId }
}

/**
 * The bot's permissions in a channel, following Discord's rules: role
 * permissions (with @everyone), then the channel's @everyone overwrite,
 * role overwrites and the bot's own member overwrite.
 */
function channelPermissions(
  guildId: string,
  channel: RawChannel,
  roles: RawRole[],
  botRoleIds: Set<string>,
  botId: string,
) {
  let base = 0n
  for (const role of roles) {
    if (role.id === guildId || botRoleIds.has(role.id)) base |= BigInt(role.permissions)
  }
  if (base & ADMINISTRATOR) return ~0n

  const overwrites = channel.permission_overwrites ?? []
  const everyone = overwrites.find((o) => o.id === guildId)
  if (everyone) base = (base & ~BigInt(everyone.deny)) | BigInt(everyone.allow)
  let allow = 0n
  let deny = 0n
  for (const o of overwrites) {
    if (o.type === 0 && o.id !== guildId && botRoleIds.has(o.id)) {
      allow |= BigInt(o.allow)
      deny |= BigInt(o.deny)
    }
  }
  base = (base & ~deny) | allow
  const own = overwrites.find((o) => o.type === 1 && o.id === botId)
  if (own) base = (base & ~BigInt(own.deny)) | BigInt(own.allow)
  return base
}

export async function listMessageChannels(
  guildId: string,
): Promise<ChannelOption[]> {
  const [channels, { roles, botRoleIds, botId }] = await Promise.all([
    discordGet<RawChannel[]>(`/guilds/${guildId}/channels`),
    rolesAndBot(guildId),
  ])
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
      canMentionEveryone:
        (channelPermissions(guildId, c, roles, botRoleIds, botId) & MENTION_EVERYONE) !== 0n,
    }))
}

export async function listRoles(guildId: string): Promise<RoleOption[]> {
  const { roles, botRoleIds } = await rolesAndBot(guildId)
  const positions = new Map(roles.map((r) => [r.id, r.position]))
  const botTop = Math.max(0, ...[...botRoleIds].map((id) => positions.get(id) ?? 0))

  return roles
    .filter((r) => !r.managed && r.id !== guildId) // skip bot roles and @everyone
    .sort((a, b) => b.position - a.position)
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      assignable: r.position < botTop,
      mentionable: r.mentionable,
    }))
}

/** A role by id, or undefined if it doesn't exist (any more). */
export async function getRole(guildId: string, roleId: string) {
  const roles = await discordGet<RawRole[]>(`/guilds/${guildId}/roles`)
  const role = roles.find((r) => r.id === roleId && r.id !== guildId)
  return role ? { id: role.id, name: role.name } : undefined
}

type RawUser = {
  id: string
  username: string
  global_name: string | null
  avatar: string | null
  bot?: boolean
}

type RawMember = { user: RawUser; nick: string | null; avatar: string | null }

function avatarUrl(guildId: string, member: RawMember) {
  const { user } = member
  if (member.avatar) {
    return `https://cdn.discordapp.com/guilds/${guildId}/users/${user.id}/avatars/${member.avatar}.png?size=64`
  }
  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
  }
  // Discord's default avatars, picked the same way the client does.
  return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`
}

function toMemberOption(guildId: string, member: RawMember): MemberOption {
  return {
    id: member.user.id,
    username: member.user.username,
    displayName: member.nick ?? member.user.global_name ?? member.user.username,
    avatarUrl: avatarUrl(guildId, member),
  }
}

/** Members whose username or nickname starts with `query` (people only, no bots). */
export async function searchMembers(guildId: string, query: string) {
  const params = new URLSearchParams({ query, limit: '10' })
  const members = await discordGet<RawMember[]>(
    `/guilds/${guildId}/members/search?${params}`,
  )
  return members
    .filter((member) => !member.user.bot)
    .map((member) => toMemberOption(guildId, member))
}

/** The member, or undefined if they aren't in the server. */
export async function getMember(guildId: string, userId: string) {
  try {
    return toMemberOption(
      guildId,
      await discordGet<RawMember>(`/guilds/${guildId}/members/${userId}`),
    )
  } catch (error) {
    if (error instanceof DiscordApiError && error.status === 404) return undefined
    throw error
  }
}

/** Opens (or reuses) the bot's DM channel with a user and returns its id. */
export async function openDm(userId: string) {
  const channel = await discordPost<{ id: string }>('/users/@me/channels', {
    recipient_id: userId,
  })
  return channel.id
}
