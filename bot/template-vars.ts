import type { Guild, User } from 'discord.js'

import type { TemplateVars } from '#/lib/templates.ts'

export function templateVars({
  user,
  displayName,
  guild,
  channelId,
}: {
  user: User
  displayName?: string
  guild: Guild | null
  channelId?: string | null
}): TemplateVars {
  return {
    user: `<@${user.id}>`,
    'user.name': displayName ?? user.displayName,
    server: guild?.name ?? '',
    memberCount: guild ? String(guild.memberCount) : '',
    channel: channelId ? `<#${channelId}>` : '',
  }
}
