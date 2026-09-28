import './env.ts'

import { Client, Events, GatewayIntentBits } from 'discord.js'

import { db } from '#/db/index.ts'

import { scheduleCommandSync, syncGuildCommands } from './commands.ts'
import { reloadAll, reloadGuild } from './config-cache.ts'
import { registerGuildEvents } from './events/guilds.ts'
import { registerInteractionEvents } from './events/interaction.ts'
import { registerMemberEvents } from './events/members.ts'
import { registerMessageEvents } from './events/message.ts'
import { syncAllGuilds } from './guilds.ts'
import { markOffline, startHeartbeat } from './heartbeat.ts'
import { startConfigListener } from './listener.ts'
import { startScheduler } from './scheduler.ts'

const FALLBACK_RELOAD_MS = 5 * 60_000

const token = process.env.DISCORD_TOKEN
if (!token) {
  console.error('DISCORD_TOKEN is not set. Add it to .env and try again.')
  process.exit(1)
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privileged: welcome + auto-role
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged: auto-responders
  ],
  // Replies may ping the people they mention, never @everyone, @here or roles.
  allowedMentions: { parse: ['users'], repliedUser: false },
})

registerGuildEvents(client)
registerInteractionEvents(client)
registerMessageEvents(client)
registerMemberEvents(client)

/** Reloads everything and re-syncs commands that changed (e.g. after missed notifications). */
async function refreshAll() {
  await reloadAll()
  for (const guild of client.guilds.cache.values()) scheduleCommandSync(guild)
}

const listener = startConfigListener({
  onChange: ({ table, guildId }) => {
    reloadGuild(guildId, table)
      .then(() => {
        const guild = client.guilds.cache.get(guildId)
        // Reminder settings decide whether /remind is registered.
        if ((table === 'commands' || table === 'reminders') && guild) {
          scheduleCommandSync(guild)
        }
      })
      .catch((error) => console.error(`Reload of ${table} failed`, error))
  },
  onReconnect: () => {
    refreshAll().catch((error) => console.error('Reload failed', error))
  },
})

let stopHeartbeat: (() => void) | undefined
let stopScheduler: (() => void) | undefined
let fallbackTimer: NodeJS.Timeout | undefined

client.once(Events.ClientReady, async (ready) => {
  console.log(`Logged in as ${ready.user.tag} in ${ready.guilds.cache.size} servers`)
  const guilds = [...ready.guilds.cache.values()]
  try {
    await syncAllGuilds(guilds)
    await reloadAll()
    for (const guild of guilds) await syncGuildCommands(guild, true)
  } catch (error) {
    // Never sync commands from an empty cache: that would wipe them in Discord.
    // The periodic reload below retries and syncs once the database answers.
    console.error(
      'Could not load config from the database. Check DATABASE_URL and run npm run db:migrate.',
      error,
    )
  }
  stopHeartbeat = startHeartbeat(ready)
  stopScheduler = startScheduler(ready)
  // Safety net in case a notification is ever lost.
  fallbackTimer = setInterval(() => {
    refreshAll().catch((error) => console.error('Periodic reload failed', error))
  }, FALLBACK_RELOAD_MS)
})

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`${signal} received, shutting down`)
  stopHeartbeat?.()
  stopScheduler?.()
  clearInterval(fallbackTimer)
  await markOffline().catch(() => {})
  await listener.stop()
  await client.destroy()
  await db.$client.end()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

try {
  await client.login(token)
} catch (error) {
  // Close code 4014 means a privileged intent is not enabled for the app.
  console.error(
    'Login failed. Check DISCORD_TOKEN, and enable the Server Members and Message Content intents in the Developer Portal (Bot tab).',
    error,
  )
  process.exit(1)
}
