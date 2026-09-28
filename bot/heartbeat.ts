import type { Client } from 'discord.js'
import { eq, lt } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { activityLog, botStatus } from '#/db/schema.ts'
import {
  ACTIVITY_RETENTION_DAYS,
  HEARTBEAT_INTERVAL_MS,
} from '#/lib/bot-config.ts'

const DAY_MS = 86_400_000

async function beat(client: Client<true>, startedAt: Date) {
  const values = {
    online: true,
    username: client.user.username,
    avatar: client.user.displayAvatarURL({ size: 128 }),
    applicationId: client.application.id,
    // ws.ping is -1 until the first gateway heartbeat is acknowledged.
    ping: client.ws.ping >= 0 ? Math.round(client.ws.ping) : null,
    guildCount: client.guilds.cache.size,
    startedAt,
    lastHeartbeat: new Date(),
  }
  await db
    .insert(botStatus)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: botStatus.id, set: values })
}

async function pruneActivity() {
  const cutoff = new Date(Date.now() - ACTIVITY_RETENTION_DAYS * DAY_MS)
  await db.delete(activityLog).where(lt(activityLog.createdAt, cutoff))
}

/** Reports presence to the dashboard and trims old activity. Returns a stop function. */
export function startHeartbeat(client: Client<true>) {
  const startedAt = new Date()
  const safely = (task: () => Promise<unknown>, label: string) => () =>
    task().catch((error) => console.error(`${label} failed`, error))

  const heartbeat = safely(() => beat(client, startedAt), 'Heartbeat')
  const prune = safely(pruneActivity, 'Activity pruning')

  void heartbeat()
  void prune()
  const timers = [
    setInterval(heartbeat, HEARTBEAT_INTERVAL_MS),
    setInterval(prune, DAY_MS),
  ]
  return () => {
    for (const timer of timers) clearInterval(timer)
  }
}

export async function markOffline() {
  await db
    .update(botStatus)
    .set({ online: false })
    .where(eq(botStatus.id, 1))
}
