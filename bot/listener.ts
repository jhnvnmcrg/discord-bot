import pg from 'pg'

import { directDatabaseUrl } from '#/db/url.ts'
import { CONFIG_CHANNEL, type ConfigChange } from '#/lib/bot-config.ts'

const MAX_BACKOFF_MS = 30_000

/**
 * Holds a dedicated connection that LISTENs for config changes from the API.
 * Reconnects with backoff; `onReconnect` runs after a reconnect so changes
 * missed while disconnected are picked up with a full reload.
 */
export function startConfigListener(handlers: {
  onChange: (change: ConfigChange) => void
  onReconnect: () => void
}) {
  let client: pg.Client | undefined
  let timer: NodeJS.Timeout | undefined
  let attempt = 0
  let connectedOnce = false
  let stopped = false

  const scheduleReconnect = () => {
    if (stopped || timer) return
    const old = client
    client = undefined
    old?.removeAllListeners()
    old?.end().catch(() => {})
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt++)
    console.warn(`Config listener disconnected; retrying in ${delay / 1000}s`)
    timer = setTimeout(() => {
      timer = undefined
      void connect()
    }, delay)
  }

  const connect = async () => {
    const next = new pg.Client({ connectionString: directDatabaseUrl() })
    client = next
    next.on('notification', (message) => {
      if (message.channel !== CONFIG_CHANNEL || !message.payload) return
      try {
        handlers.onChange(JSON.parse(message.payload) as ConfigChange)
      } catch (error) {
        console.error('Ignoring malformed config notification', error)
      }
    })
    next.on('error', (error) => {
      console.error('Config listener error', error.message)
      scheduleReconnect()
    })
    next.on('end', scheduleReconnect)
    try {
      await next.connect()
      await next.query(`LISTEN ${CONFIG_CHANNEL}`)
      attempt = 0
      if (connectedOnce) handlers.onReconnect()
      connectedOnce = true
    } catch (error) {
      console.error(
        'Could not LISTEN for config changes',
        error instanceof Error ? error.message : error,
      )
      scheduleReconnect()
    }
  }

  void connect()

  return {
    async stop() {
      stopped = true
      clearTimeout(timer)
      client?.removeAllListeners()
      await client?.end().catch(() => {})
    },
  }
}
