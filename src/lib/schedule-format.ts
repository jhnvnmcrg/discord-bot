import cronstrue from 'cronstrue'

import type { Schedule } from './schedule'

// Human-readable schedule text for the dashboard (browser only).

export const WEEKDAYS = [
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
  { value: 6, short: 'Sat', long: 'Saturday' },
  { value: 0, short: 'Sun', long: 'Sunday' },
] as const

function ordinal(n: number) {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? 'th'
      : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}

/** Formats a 'YYYY-MM-DDTHH:mm' wall-clock value without shifting time zones. */
function formatWallClock(at: string) {
  const [date, time] = at.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return `${day} at ${time}`
}

export function describeCron(expression: string) {
  try {
    return cronstrue.toString(expression, {
      use24HourTimeFormat: true,
      throwExceptionOnParseError: true,
    })
  } catch {
    return undefined
  }
}

export function describeSchedule(schedule: Schedule): string {
  switch (schedule.type) {
    case 'once':
      return `Once, on ${formatWallClock(schedule.at)}`
    case 'daily':
      return `Every day at ${schedule.time}`
    case 'weekly': {
      const days = WEEKDAYS.filter((d) => schedule.days.includes(d.value))
      if (days.length === 7) return `Every day at ${schedule.time}`
      const weekdaysOnly =
        days.length === 5 && days.every((d) => d.value >= 1 && d.value <= 5)
      const label = weekdaysOnly
        ? 'Weekdays'
        : days.length === 1
          ? `Every ${days[0].long}`
          : `Every ${days.map((d) => d.short).join(', ')}`
      return `${label} at ${schedule.time}`
    }
    case 'monthly':
      return schedule.day === 'last'
        ? `Monthly on the last day at ${schedule.time}`
        : `Monthly on the ${ordinal(schedule.day)} at ${schedule.time}`
    case 'cron':
      return describeCron(schedule.expression) ?? schedule.expression
  }
}

/** "Mon 5 Oct, 09:00" in the given zone. */
export function formatInZone(date: Date | string, timezone: string) {
  return new Date(date).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: timezone,
  })
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** "in 3 hours", "2 days ago". */
export function formatRelative(date: Date | string, now = Date.now()) {
  const seconds = (new Date(date).getTime() - now) / 1000
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ]
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return seconds >= 0 ? 'in under a minute' : 'just now'
}

export function timezones() {
  const zones = Intl.supportedValuesOf('timeZone')
  return zones.includes('UTC') ? zones : ['UTC', ...zones]
}

export function browserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}
