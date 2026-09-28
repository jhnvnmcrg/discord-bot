import { type Client, Events } from 'discord.js'

import { forgetGuild, syncGuildCommands } from '../commands.ts'
import { reloadGuild } from '../config-cache.ts'
import { markGuildLeft, upsertGuild } from '../guilds.ts'

export function registerGuildEvents(client: Client) {
  client.on(Events.GuildCreate, async (guild) => {
    console.log(`Joined ${guild.name}`)
    try {
      await upsertGuild(guild)
      // Settings survive a kick, so a re-added bot picks up where it left off.
      await reloadGuild(guild.id)
      await syncGuildCommands(guild, true)
    } catch (error) {
      console.error(`Could not set up ${guild.name}`, error)
    }
  })

  client.on(Events.GuildUpdate, (_, guild) => {
    upsertGuild(guild).catch((error) => console.error('Guild update failed', error))
  })

  client.on(Events.GuildDelete, async (guild) => {
    // An outage makes guilds unavailable without the bot actually leaving.
    if (!guild.available) return
    console.log(`Left ${guild.name}`)
    forgetGuild(guild.id)
    await markGuildLeft(guild.id).catch((error) =>
      console.error('Could not mark guild as left', error),
    )
  })
}
