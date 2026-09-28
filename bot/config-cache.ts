import { eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import {
  type AutoResponder,
  autoResponders,
  type CustomCommand,
  customCommands,
  type ReminderSettings,
  reminderSettings,
  type WelcomeSettings,
  welcomeSettings,
} from '#/db/schema.ts'
import type { ConfigTable } from '#/lib/bot-config.ts'
import { compileMatcher } from '#/lib/matching.ts'

// In-memory copy of each guild's config, so events never wait on the database.
// The API's NOTIFY (see listener.ts) tells us when to reload a guild.

export type CompiledResponder = AutoResponder & {
  matches: (content: string) => boolean
}

type GuildConfig = {
  commands: Map<string, CustomCommand>
  responders: CompiledResponder[]
  welcome?: WelcomeSettings
  /** Undefined until an admin saves settings; the defaults apply then. */
  reminders?: ReminderSettings
}

const cache = new Map<string, GuildConfig>()

export function getGuildConfig(guildId: string): GuildConfig {
  let config = cache.get(guildId)
  if (!config) {
    config = { commands: new Map(), responders: [] }
    cache.set(guildId, config)
  }
  return config
}

function compile(rows: AutoResponder[]): CompiledResponder[] {
  const compiled: CompiledResponder[] = []
  for (const row of rows) {
    if (!row.enabled) continue
    const matches = compileMatcher(row)
    // Invalid regexes are rejected by the API; skip any that slip through.
    if (matches) compiled.push({ ...row, matches })
  }
  return compiled
}

function groupBy<T extends { guildId: string }>(rows: T[]) {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    groups.set(row.guildId, [...(groups.get(row.guildId) ?? []), row])
  }
  return groups
}

export async function reloadGuild(guildId: string, table?: ConfigTable) {
  const config = getGuildConfig(guildId)
  if (!table || table === 'commands') {
    const rows = await db
      .select()
      .from(customCommands)
      .where(eq(customCommands.guildId, guildId))
    config.commands = new Map(rows.map((row) => [row.name, row]))
  }
  if (!table || table === 'responders') {
    const rows = await db
      .select()
      .from(autoResponders)
      .where(eq(autoResponders.guildId, guildId))
      .orderBy(autoResponders.createdAt)
    config.responders = compile(rows)
  }
  if (!table || table === 'welcome') {
    const [row] = await db
      .select()
      .from(welcomeSettings)
      .where(eq(welcomeSettings.guildId, guildId))
    config.welcome = row
  }
  if (!table || table === 'reminders') {
    const [row] = await db
      .select()
      .from(reminderSettings)
      .where(eq(reminderSettings.guildId, guildId))
    config.reminders = row
  }
}

export async function reloadAll() {
  const [commands, responders, welcome, reminderRows] = await Promise.all([
    db.select().from(customCommands),
    db.select().from(autoResponders).orderBy(autoResponders.createdAt),
    db.select().from(welcomeSettings),
    db.select().from(reminderSettings),
  ])
  cache.clear()
  for (const [guildId, rows] of groupBy(commands)) {
    getGuildConfig(guildId).commands = new Map(rows.map((row) => [row.name, row]))
  }
  for (const [guildId, rows] of groupBy(responders)) {
    getGuildConfig(guildId).responders = compile(rows)
  }
  for (const row of welcome) {
    getGuildConfig(row.guildId).welcome = row
  }
  for (const row of reminderRows) {
    getGuildConfig(row.guildId).reminders = row
  }
}

/** Reminder settings with defaults filled in for servers that never saved any. */
export function reminderSettingsFor(guildId: string) {
  const saved = getGuildConfig(guildId).reminders
  return {
    enabled: saved?.enabled ?? true,
    defaultTimezone: saved?.defaultTimezone ?? 'UTC',
    maxPerMember: saved?.maxPerMember ?? 10,
  }
}
