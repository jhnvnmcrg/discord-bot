import type {
  ActivityEntry,
  ActivityType,
  AutoResponder,
  CustomCommand,
  Guild,
  ScheduledMessage,
  WelcomeSettings,
} from '#/db/schema.ts'

// JSON shapes returned by /api/*. Dates arrive as ISO strings.
export type Serialized<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Date | null
      ? string | null
      : T[K]
}

export type BotStatusDto = {
  online: boolean
  username: string | null
  avatar: string | null
  applicationId: string | null
  ping: number | null
  guildCount: number
  startedAt: string | null
  lastHeartbeat: string | null
}

export type GuildSummary = Serialized<Guild> & {
  commandCount: number
  responderCount: number
  scheduleCount: number
  welcomeEnabled: boolean
}

export type CommandDto = Serialized<CustomCommand>
export type ResponderDto = Serialized<AutoResponder>
export type ScheduleDto = Serialized<ScheduledMessage>
export type WelcomeDto = Omit<Serialized<WelcomeSettings>, 'updatedAt'> & {
  updatedAt: string | null
}
export type ActivityDto = Serialized<ActivityEntry>

export type ActivityPage = {
  items: ActivityDto[]
  nextCursor: number | null
}

export type ChannelOption = {
  id: string
  name: string
  type: number
  parentName: string | null
}

export type RoleOption = {
  id: string
  name: string
  color: number
  /** False when the role sits at or above the bot's highest role. */
  assignable: boolean
}

export type StatsDay = { date: string } & Record<ActivityType, number>

export type StatsResponse = {
  days: StatsDay[]
  totals: Record<ActivityType, number>
  topCommands: { name: string; count: number }[]
}

export type ApiIssue = { path: string; message: string }
export type ApiError = { error: string; issues?: ApiIssue[] }
