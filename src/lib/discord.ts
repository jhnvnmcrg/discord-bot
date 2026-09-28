// View Channels (1<<10) + Send Messages (1<<11) + Embed Links (1<<14)
// + Read Message History (1<<16) + Mention @everyone, @here and All Roles
// (1<<17, for opt-in pings) + Manage Roles (1<<28, for auto-role).
export const INVITE_PERMISSIONS = '268651520'

// GUILD_TEXT and GUILD_ANNOUNCEMENT — the channels a welcome message can go to.
export const MESSAGE_CHANNEL_TYPES = [0, 5] as const

export function inviteUrl(clientId: string, guildId?: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: INVITE_PERMISSIONS,
    scope: 'bot applications.commands',
  })
  if (guildId) {
    params.set('guild_id', guildId)
    params.set('disable_guild_select', 'true')
  }
  return `https://discord.com/oauth2/authorize?${params}`
}

export function guildIconUrl(guild: { id: string; icon: string | null }) {
  if (!guild.icon) return undefined
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=96`
}

/** "My Cool Server" → "MCS", for icon fallbacks. */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}
