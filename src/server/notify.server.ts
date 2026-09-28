import { sql } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import {
  CONFIG_CHANNEL,
  type ConfigChange,
  type ConfigTable,
} from '#/lib/bot-config.ts'

/** Tells a running bot to reload one guild's config. Payloads stay tiny (8KB NOTIFY limit). */
export async function notifyBot(table: ConfigTable, guildId: string) {
  const payload: ConfigChange = { table, guildId }
  await db.execute(
    sql`select pg_notify(${CONFIG_CHANNEL}, ${JSON.stringify(payload)})`,
  )
}
