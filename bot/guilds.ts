import type { Guild } from 'discord.js'
import { and, eq, isNull, notInArray } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { guilds } from '#/db/schema.ts'

export async function upsertGuild(guild: Guild) {
  const values = {
    name: guild.name,
    icon: guild.icon,
    memberCount: guild.memberCount,
    joinedAt: guild.joinedAt,
    leftAt: null,
  }
  await db
    .insert(guilds)
    .values({ id: guild.id, ...values })
    .onConflictDoUpdate({ target: guilds.id, set: values })
}

export async function markGuildLeft(guildId: string) {
  await db
    .update(guilds)
    .set({ leftAt: new Date() })
    .where(eq(guilds.id, guildId))
}

/** On startup: upsert every guild the bot is in and mark the rest as left. */
export async function syncAllGuilds(current: Guild[]) {
  for (const guild of current) await upsertGuild(guild)
  const ids = current.map((guild) => guild.id)
  await db
    .update(guilds)
    .set({ leftAt: new Date() })
    .where(
      and(
        isNull(guilds.leftAt),
        ids.length > 0 ? notInArray(guilds.id, ids) : undefined,
      ),
    )
}
