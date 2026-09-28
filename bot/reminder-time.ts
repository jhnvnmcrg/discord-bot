import * as chrono from 'chrono-node'

export const MIN_REMINDER_AHEAD_MS = 60_000
export const MAX_REMINDER_AHEAD_MS = 365 * 86_400_000

/** Minutes the zone is ahead of UTC at `date` (e.g. +60 for Europe/London in summer). */
export function zoneOffsetMinutes(timezone: string, date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)
  const wallClockAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return Math.round((wallClockAsUtc - date.getTime()) / 60_000)
}

function parseAt(input: string, now: Date, offset: number) {
  return chrono
    .parse(input, { instant: now, timezone: offset }, { forwardDate: true })[0]
    ?.start.date()
}

export type ParsedTime =
  | { ok: true; dueAt: Date; dependsOnZone: boolean }
  | { ok: false; error: string }

/**
 * Reads "in 2h", "tomorrow 9am", "friday 8pm", "Oct 3 14:00"… in the member's
 * time zone. `dependsOnZone` is false for purely relative times like "in 2h".
 */
export function parseReminderTime(
  input: string,
  timezone: string,
  now = new Date(),
): ParsedTime {
  const offsetNow = zoneOffsetMinutes(timezone, now)
  let dueAt = parseAt(input, now, offsetNow)
  if (!dueAt) {
    return {
      ok: false,
      error: `I couldn't read "${input}" as a time. Try "in 2 hours", "tomorrow 9am" or "friday 8pm".`,
    }
  }
  // If the moment falls on the other side of a DST change, read it again
  // with the offset that applies then.
  const offsetThen = zoneOffsetMinutes(timezone, dueAt)
  if (offsetThen !== offsetNow) dueAt = parseAt(input, now, offsetThen) ?? dueAt

  const ahead = dueAt.getTime() - now.getTime()
  if (ahead < MIN_REMINDER_AHEAD_MS) {
    return { ok: false, error: 'Pick a time at least a minute from now.' }
  }
  if (ahead > MAX_REMINDER_AHEAD_MS) {
    return { ok: false, error: 'Reminders can be at most a year ahead.' }
  }

  // A time that reads the same in a zone 12 hours away doesn't depend on the zone.
  const elsewhere = parseAt(input, now, offsetNow + 720)
  return {
    ok: true,
    dueAt,
    dependsOnZone: elsewhere?.getTime() !== dueAt.getTime(),
  }
}
