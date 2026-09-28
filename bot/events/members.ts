import { type Client, Events, type GuildMember } from 'discord.js'

import { renderTemplate } from '#/lib/templates.ts'

import { getGuildConfig } from '../config-cache.ts'
import { upsertGuild } from '../guilds.ts'
import { logActivity, logError } from '../log.ts'
import { templateVars } from '../template-vars.ts'

async function giveAutoRole(member: GuildMember) {
  const roleId = getGuildConfig(member.guild.id).welcome?.autoRoleId
  if (!roleId) return
  try {
    await member.roles.add(roleId, 'Auto-role for new members')
  } catch (error) {
    // Usually the role sits above the bot's highest role.
    await logError(member.guild.id, 'auto_role', error, { roleId, userId: member.id })
  }
}

async function sendWelcome(member: GuildMember) {
  const welcome = getGuildConfig(member.guild.id).welcome
  if (!welcome?.enabled || !welcome.channelId) return

  const channel = member.guild.channels.cache.get(welcome.channelId)
  if (!channel?.isSendable()) {
    await logError(
      member.guild.id,
      'welcome',
      new Error('The welcome channel is missing or the bot cannot post there.'),
      { channelId: welcome.channelId },
    )
    return
  }

  const vars = templateVars({
    user: member.user,
    displayName: member.displayName,
    guild: member.guild,
    channelId: channel.id,
  })
  try {
    await channel.send({
      content: renderTemplate(welcome.message, vars).slice(0, 2000),
      allowedMentions: { users: [member.id] },
    })
  } catch (error) {
    await logError(member.guild.id, 'welcome', error, { channelId: channel.id })
  }
}

export function registerMemberEvents(client: Client) {
  client.on(Events.GuildMemberAdd, async (member) => {
    await Promise.all([
      upsertGuild(member.guild).catch((error) =>
        console.error('Could not update member count', error),
      ),
      logActivity({
        guildId: member.guild.id,
        type: 'member_join',
        userId: member.id,
        metadata: { username: member.user.username },
      }),
      sendWelcome(member),
    ])
    // Members going through membership screening get the role once they pass.
    if (!member.pending) await giveAutoRole(member)
  })

  client.on(Events.GuildMemberUpdate, async (before, after) => {
    if (before.pending && !after.pending) await giveAutoRole(after)
  })

  client.on(Events.GuildMemberRemove, async (member) => {
    await Promise.all([
      upsertGuild(member.guild).catch((error) =>
        console.error('Could not update member count', error),
      ),
      logActivity({
        guildId: member.guild.id,
        type: 'member_leave',
        userId: member.id,
        metadata: { username: member.user?.username },
      }),
    ])
  })
}
