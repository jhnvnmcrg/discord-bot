import { Cron } from 'croner'

// Scheduled-message timing, shared by the API (validation, next run on save),
// the bot (next run after each send) and the dashboard (previews). Node-safe.

export const SCHEDULE_TYPES = ['once', 'daily', 'weekly', 'monthly', 'cron'] as const
export type ScheduleType = (typeof SCHEDULE_TYPES)[number]

/**
 * Times are wall-clock values in the message's time zone, so "09:00" stays
 * 09:00 across daylight-saving changes. Weekdays: 0 = Sunday … 6 = Saturday.
 */
export type Schedule =
  | { type: 'once'; at: string } // 'YYYY-MM-DDTHH:mm'
  | { type: 'daily'; time: string } // 'HH:mm'
  | { type: 'weekly'; time: string; days: number[] }
  | { type: 'monthly'; time: string; day: number | 'last' }
  | { type: 'cron'; expression: string }

/** How often the bot looks for due messages. */
export const SCHEDULER_TICK_MS = 15_000

/** A run this late means the bot was offline when it was due; it is skipped. */
export const MISSED_AFTER_MS = 2 * 60_000

/** Custom cron expressions may not fire more often than this. */
export const MIN_CRON_INTERVAL_MS = 5 * 60_000

export function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

function hoursMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return { hours, minutes }
}

function toPattern(schedule: Schedule) {
  if (schedule.type === 'once') return `${schedule.at}:00`
  if (schedule.type === 'cron') return schedule.expression.trim()
  const { hours, minutes } = hoursMinutes(schedule.time)
  switch (schedule.type) {
    case 'daily':
      return `${minutes} ${hours} * * *`
    case 'weekly':
      return `${minutes} ${hours} * * ${[...new Set(schedule.days)].sort().join(',')}`
    case 'monthly':
      return `${minutes} ${hours} ${schedule.day === 'last' ? 'L' : schedule.day} * *`
  }
}

/** The next `count` send times strictly after `from`. Empty when there are none. */
export function nextRuns(
  schedule: Schedule,
  timezone: string,
  count: number,
  from = new Date(),
): Date[] {
  try {
    return new Cron(toPattern(schedule), { timezone, paused: true }).nextRuns(
      count,
      from,
    )
  } catch {
    return []
  }
}

export function computeNextRun(
  schedule: Schedule,
  timezone: string,
  from = new Date(),
): Date | null {
  return nextRuns(schedule, timezone, 1, from)[0] ?? null
}

/** Why a custom cron expression is rejected, or undefined when it is fine. */
export function cronProblem(expression: string): string | undefined {
  if (expression.trim().split(/\s+/).length !== 5) {
    return 'Use five fields: minute, hour, day of month, month, day of week'
  }
  let runs: Date[]
  try {
    runs = new Cron(expression.trim(), { paused: true }).nextRuns(6)
  } catch {
    return 'This is not a valid cron expression'
  }
  if (runs.length === 0) return 'This expression never runs'
  for (let i = 1; i < runs.length; i++) {
    if (runs[i].getTime() - runs[i - 1].getTime() < MIN_CRON_INTERVAL_MS) {
      return 'Runs must be at least 5 minutes apart'
    }
  }
  return undefined
}
