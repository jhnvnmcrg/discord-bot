// Contract between the web app and the bot process. Node-safe: the bot imports this.

/** Postgres NOTIFY channel the API signals on after every config write. */
export const CONFIG_CHANNEL = 'bot_config'

export type ConfigTable = 'commands' | 'responders' | 'welcome' | 'reminders'

export type ConfigChange = { table: ConfigTable; guildId: string }

export const HEARTBEAT_INTERVAL_MS = 30_000

/** The dashboard shows the bot offline once its heartbeat is older than this. */
export const HEARTBEAT_STALE_MS = 90_000

export const ACTIVITY_RETENTION_DAYS = 30

export function isBotOnline(status: {
  online: boolean
  lastHeartbeat: Date | string
}) {
  const last = new Date(status.lastHeartbeat).getTime()
  return status.online && Date.now() - last < HEARTBEAT_STALE_MS
}
