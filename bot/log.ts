import { db } from '#/db/index.ts'
import { activityLog } from '#/db/schema.ts'

type NewActivity = typeof activityLog.$inferInsert

/** Writes an activity row. Logging must never break the bot, so failures are only printed. */
export async function logActivity(entry: NewActivity) {
  try {
    await db.insert(activityLog).values(entry)
  } catch (error) {
    console.error('Could not write activity log', error)
  }
}

export function logError(
  guildId: string | null,
  name: string,
  error: unknown,
  metadata: Record<string, unknown> = {},
) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[${name}]${guildId ? ` guild ${guildId}:` : ''}`, error)
  return logActivity({
    guildId,
    type: 'error',
    name,
    metadata: { ...metadata, message },
  })
}
