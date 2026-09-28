import {
  type ApplicationCommandDataResolvable,
  ApplicationCommandType,
  type Guild,
} from 'discord.js'

import { getGuildConfig, reminderSettingsFor } from './config-cache.ts'
import { logError } from './log.ts'
import { remindCommand } from './reminders.ts'

// Custom commands are registered per guild with a bulk overwrite, so Discord
// always mirrors exactly the enabled rows. Syncs are debounced (saving several
// commands in a row costs one request) and skipped when nothing changed.

const SYNC_DEBOUNCE_MS = 2_000

const pending = new Map<string, NodeJS.Timeout>()
const lastSynced = new Map<string, string>()

function definitions(guildId: string): ApplicationCommandDataResolvable[] {
  const custom: ApplicationCommandDataResolvable[] = [
    ...getGuildConfig(guildId).commands.values(),
  ]
    .filter((command) => command.enabled)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((command) => ({
      type: ApplicationCommandType.ChatInput,
      name: command.name,
      description: command.description,
    }))
  // Built-in commands, registered alongside the dashboard's custom ones.
  if (reminderSettingsFor(guildId).enabled) custom.push(remindCommand)
  return custom
}

export async function syncGuildCommands(guild: Guild, force = false) {
  const defs = definitions(guild.id)
  const signature = JSON.stringify(defs)
  if (!force && lastSynced.get(guild.id) === signature) return
  try {
    await guild.commands.set(defs)
    lastSynced.set(guild.id, signature)
    console.log(`Synced ${defs.length} commands in ${guild.name}`)
  } catch (error) {
    await logError(guild.id, 'command_sync', error)
  }
}

export function scheduleCommandSync(guild: Guild) {
  clearTimeout(pending.get(guild.id))
  pending.set(
    guild.id,
    setTimeout(() => {
      pending.delete(guild.id)
      void syncGuildCommands(guild)
    }, SYNC_DEBOUNCE_MS),
  )
}

export function forgetGuild(guildId: string) {
  clearTimeout(pending.get(guildId))
  pending.delete(guildId)
  lastSynced.delete(guildId)
}
