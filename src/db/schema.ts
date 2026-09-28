import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import type { Schedule } from '../lib/schedule.ts'
import { DEFAULT_WELCOME_MESSAGE } from '../lib/templates.ts'

// Discord snowflakes exceed Number.MAX_SAFE_INTEGER, so ids are stored as text.

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

export const guilds = pgTable('guilds', {
  id: text().primaryKey(),
  name: text().notNull(),
  icon: text(),
  memberCount: integer('member_count').notNull().default(0),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  // Soft delete: settings survive the bot being removed and re-added.
  leftAt: timestamp('left_at', { withTimezone: true }),
  updatedAt: updatedAt(),
})

export const responseType = pgEnum('response_type', ['text', 'embed'])

export type MentionSnapshot = {
  id: string
  username: string
  displayName: string
  avatarUrl: string
}

/**
 * Who a scheduled message pings. Member entries saved before roles and
 * @everyone were supported have no `type`; see asMentionTarget().
 */
export type MentionTarget =
  | ({ type: 'member' } & MentionSnapshot)
  | { type: 'role'; id: string; name: string }
  | { type: 'everyone' }
  | { type: 'here' }

export type CommandEmbed = {
  title?: string
  description?: string
  color?: string
}

export const customCommands = pgTable(
  'custom_commands',
  {
    id: serial().primaryKey(),
    guildId: text('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    name: varchar({ length: 32 }).notNull(),
    description: varchar({ length: 100 }).notNull(),
    responseType: responseType('response_type').notNull().default('text'),
    content: text().notNull().default(''),
    embed: jsonb().$type<CommandEmbed>(),
    ephemeral: boolean().notNull().default(false),
    enabled: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('custom_commands_guild_name_idx').on(t.guildId, t.name)],
)

export const matchType = pgEnum('match_type', [
  'contains',
  'exact',
  'startsWith',
  'regex',
])

export const autoResponders = pgTable(
  'auto_responders',
  {
    id: serial().primaryKey(),
    guildId: text('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    trigger: text().notNull(),
    matchType: matchType('match_type').notNull().default('contains'),
    caseSensitive: boolean('case_sensitive').notNull().default(false),
    response: text().notNull(),
    cooldownSeconds: integer('cooldown_seconds').notNull().default(10),
    enabled: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('auto_responders_guild_idx').on(t.guildId)],
)

export const welcomeSettings = pgTable('welcome_settings', {
  guildId: text('guild_id')
    .primaryKey()
    .references(() => guilds.id, { onDelete: 'cascade' }),
  enabled: boolean().notNull().default(false),
  channelId: text('channel_id'),
  message: text().notNull().default(DEFAULT_WELCOME_MESSAGE),
  autoRoleId: text('auto_role_id'),
  updatedAt: updatedAt(),
})

export const activityType = pgEnum('activity_type', [
  'command',
  'autoresponse',
  'member_join',
  'member_leave',
  'error',
  'scheduled',
  'reminder',
  'message',
])

export const activityLog = pgTable(
  'activity_log',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    guildId: text('guild_id'),
    type: activityType().notNull(),
    name: text(),
    userId: text('user_id'),
    channelId: text('channel_id'),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('activity_log_created_idx').on(t.createdAt),
    index('activity_log_guild_created_idx').on(t.guildId, t.createdAt),
  ],
)

export const scheduleResult = pgEnum('schedule_result', [
  'sent',
  'missed',
  'failed',
])

export const scheduledMessages = pgTable(
  'scheduled_messages',
  {
    id: serial().primaryKey(),
    guildId: text('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    name: varchar({ length: 100 }).notNull(),
    channelId: text('channel_id').notNull(),
    schedule: jsonb().$type<Schedule>().notNull(),
    /** IANA zone the schedule's wall-clock times are in, e.g. Europe/London. */
    timezone: text().notNull(),
    responseType: responseType('response_type').notNull().default('text'),
    content: text().notNull().default(''),
    embed: jsonb().$type<CommandEmbed>(),
    /** Who the message pings, as saved: a member, a role, @everyone or @here. */
    mention: jsonb().$type<MentionTarget | MentionSnapshot>(),
    enabled: boolean().notNull().default(true),
    /** Null when nothing is due: disabled, or a one-time message already sent. */
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    lastResult: scheduleResult('last_result'),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('scheduled_messages_guild_idx').on(t.guildId),
    index('scheduled_messages_due_idx').on(t.nextRunAt),
  ],
)

export const reminderDelivery = pgEnum('reminder_delivery', ['channel', 'dm'])
export const reminderStatus = pgEnum('reminder_status', [
  'pending',
  'sent',
  'failed',
])

/** Personal reminders members set with /remind. */
export const reminders = pgTable(
  'reminders',
  {
    id: serial().primaryKey(),
    guildId: text('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    username: text().notNull(),
    /** Where /remind was used; channel reminders are posted back here. */
    channelId: text('channel_id').notNull(),
    text: varchar({ length: 500 }).notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    delivery: reminderDelivery().notNull().default('channel'),
    status: reminderStatus().notNull().default('pending'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (t) => [
    index('reminders_due_idx').on(t.status, t.dueAt),
    index('reminders_member_idx').on(t.guildId, t.userId),
  ],
)

export const reminderSettings = pgTable('reminder_settings', {
  guildId: text('guild_id')
    .primaryKey()
    .references(() => guilds.id, { onDelete: 'cascade' }),
  enabled: boolean().notNull().default(true),
  /** Used to read times like "tomorrow 9am" for members with no time zone set. */
  defaultTimezone: text('default_timezone').notNull().default('UTC'),
  maxPerMember: integer('max_per_member').notNull().default(10),
  updatedAt: updatedAt(),
})

/** Set by members with /remind timezone; applies in every server. */
export const memberTimezones = pgTable('member_timezones', {
  userId: text('user_id').primaryKey(),
  timezone: text().notNull(),
  updatedAt: updatedAt(),
})

// Singleton row (id = 1) the bot upserts on every heartbeat.
export const botStatus = pgTable('bot_status', {
  id: integer().primaryKey().default(1),
  online: boolean().notNull().default(false),
  username: text(),
  /** Full CDN URL of the bot's avatar. */
  avatar: text(),
  applicationId: text('application_id'),
  ping: integer(),
  guildCount: integer('guild_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

export type Guild = typeof guilds.$inferSelect
export type CustomCommand = typeof customCommands.$inferSelect
export type AutoResponder = typeof autoResponders.$inferSelect
export type WelcomeSettings = typeof welcomeSettings.$inferSelect
export type ActivityEntry = typeof activityLog.$inferSelect
export type BotStatus = typeof botStatus.$inferSelect
export type ScheduledMessage = typeof scheduledMessages.$inferSelect
export type Reminder = typeof reminders.$inferSelect
export type ReminderSettings = typeof reminderSettings.$inferSelect
export type ActivityType = (typeof activityType.enumValues)[number]
