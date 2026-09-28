import {
  type ChatInputCommandInteraction,
  type Client,
  Events,
  MessageFlags,
} from 'discord.js'

import { buildMessagePayload } from '#/lib/message-payload.ts'

import { getGuildConfig } from '../config-cache.ts'
import { logActivity, logError } from '../log.ts'
import { handleRemind, handleRemindAutocomplete } from '../reminders.ts'
import { templateVars } from '../template-vars.ts'

async function handleCommand(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId
  if (!guildId) return

  const command = getGuildConfig(guildId).commands.get(interaction.commandName)
  // Not one of ours (e.g. a global command owned by other code): leave it alone.
  if (!command) return
  if (!command.enabled) {
    // Discord can briefly show a command after it was turned off.
    await interaction.reply({
      content: 'This command is turned off.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const vars = templateVars({
    user: interaction.user,
    displayName: interaction.inCachedGuild()
      ? interaction.member.displayName
      : undefined,
    guild: interaction.guild,
    channelId: interaction.channelId,
  })
  await interaction.reply({
    ...buildMessagePayload(command, vars),
    flags: command.ephemeral ? MessageFlags.Ephemeral : undefined,
  })

  await logActivity({
    guildId,
    type: 'command',
    name: command.name,
    userId: interaction.user.id,
    channelId: interaction.channelId,
    metadata: { username: interaction.user.username },
  })
}

export function registerInteractionEvents(client: Client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isAutocomplete()) {
      if (interaction.commandName !== 'remind') return
      await handleRemindAutocomplete(interaction).catch((error) =>
        console.error('Autocomplete failed', error),
      )
      return
    }
    if (!interaction.isChatInputCommand()) return
    try {
      if (interaction.commandName === 'remind') await handleRemind(interaction)
      else await handleCommand(interaction)
    } catch (error) {
      await logError(interaction.guildId, 'command', error, {
        command: interaction.commandName,
      })
      const reply = {
        content: 'Something went wrong running this command.',
        flags: MessageFlags.Ephemeral,
      } as const
      await (interaction.replied || interaction.deferred
        ? interaction.followUp(reply)
        : interaction.reply(reply)
      ).catch(() => {})
    }
  })
}
