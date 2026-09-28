import { createFileRoute } from '@tanstack/react-router'
import { and, count, desc, eq, gte, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '#/db/index.ts'
import { type ActivityType, activityLog, activityType } from '#/db/schema.ts'
import type { StatsDay, StatsResponse } from '#/lib/api-types'
import { snowflake } from '#/lib/schemas'
import { invalid, ok } from '#/server/http.server'

const query = z.object({
  guildId: snowflake.optional(),
  days: z.coerce.number().int().min(1).max(30).default(7),
})

const DAY_MS = 86_400_000

function emptyCounts() {
  return Object.fromEntries(activityType.enumValues.map((t) => [t, 0])) as Record<
    ActivityType,
    number
  >
}

export const Route = createFileRoute('/api/stats')({
  server: {
    handlers: {
      // Daily event counts (UTC days) plus the most-used commands.
      // Without ?guildId it covers every server.
      GET: async ({ request }) => {
        const search = Object.fromEntries(new URL(request.url).searchParams)
        const parsed = query.safeParse(search)
        if (!parsed.success) return invalid(parsed.error)
        const { guildId, days } = parsed.data

        const todayUtc = Math.floor(Date.now() / DAY_MS) * DAY_MS
        const since = new Date(todayUtc - (days - 1) * DAY_MS)
        const scope = and(
          gte(activityLog.createdAt, since),
          guildId ? eq(activityLog.guildId, guildId) : undefined,
        )

        const day = sql<string>`to_char(date_trunc('day', ${activityLog.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`
        const [daily, top] = await Promise.all([
          db
            .select({ day, type: activityLog.type, total: count() })
            .from(activityLog)
            .where(scope)
            .groupBy(day, activityLog.type),
          db
            .select({ name: activityLog.name, total: count() })
            .from(activityLog)
            .where(and(scope, eq(activityLog.type, 'command')))
            .groupBy(activityLog.name)
            .orderBy(desc(count()))
            .limit(5),
        ])

        // Fill every day in the range so the chart has no gaps.
        const byDay = new Map<string, StatsDay>()
        for (let i = 0; i < days; i++) {
          const date = new Date(since.getTime() + i * DAY_MS)
            .toISOString()
            .slice(0, 10)
          byDay.set(date, { date, ...emptyCounts() })
        }
        const totals = emptyCounts()
        for (const row of daily) {
          const entry = byDay.get(row.day)
          if (entry) entry[row.type] = row.total
          totals[row.type] += row.total
        }

        const stats: StatsResponse = {
          days: [...byDay.values()],
          totals,
          topCommands: top.map((row) => ({
            name: row.name ?? 'unknown',
            count: row.total,
          })),
        }
        return ok(stats)
      },
    },
  },
})
