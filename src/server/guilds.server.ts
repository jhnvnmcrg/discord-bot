import { asc, eq, getTableColumns, isNull, sql } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { guilds } from '#/db/schema.ts'

// Drizzle renders ${guilds.id} unqualified in a single-table select, which the
// subqueries would resolve to their own `id`, so the outer column is spelled out.
const summaryColumns = {
  ...getTableColumns(guilds),
  commandCount: sql<number>`(select count(*)::int from custom_commands c where c.guild_id = guilds.id)`,
  responderCount: sql<number>`(select count(*)::int from auto_responders r where r.guild_id = guilds.id)`,
  welcomeEnabled: sql<boolean>`coalesce((select w.enabled from welcome_settings w where w.guild_id = guilds.id), false)`,
}

export function listGuildSummaries() {
  return db
    .select(summaryColumns)
    .from(guilds)
    .where(isNull(guilds.leftAt))
    .orderBy(asc(guilds.name))
}

export async function getGuildSummary(guildId: string) {
  const [guild] = await db
    .select(summaryColumns)
    .from(guilds)
    .where(eq(guilds.id, guildId))
  return guild?.leftAt ? undefined : guild
}
