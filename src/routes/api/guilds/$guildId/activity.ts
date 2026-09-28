import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq, lt } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '#/db/index.ts'
import { activityLog, activityType } from '#/db/schema.ts'
import type { ActivityPage } from '#/lib/api-types'
import { findActiveGuild, guildNotFound, invalid, ok } from '#/server/http.server'

const query = z.object({
  type: z.enum(activityType.enumValues).optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const Route = createFileRoute('/api/guilds/$guildId/activity')({
  server: {
    handlers: {
      // Newest first, keyset-paginated: pass the returned nextCursor as ?cursor=.
      GET: async ({ params, request }) => {
        if (!(await findActiveGuild(params.guildId))) return guildNotFound()

        const search = Object.fromEntries(new URL(request.url).searchParams)
        const parsed = query.safeParse(search)
        if (!parsed.success) return invalid(parsed.error)
        const { type, cursor, limit } = parsed.data

        const rows = await db
          .select()
          .from(activityLog)
          .where(
            and(
              eq(activityLog.guildId, params.guildId),
              type ? eq(activityLog.type, type) : undefined,
              cursor ? lt(activityLog.id, cursor) : undefined,
            ),
          )
          .orderBy(desc(activityLog.id))
          .limit(limit + 1)

        const items = rows.slice(0, limit)
        const page: ActivityPage = {
          items: items.map((row) => ({
            ...row,
            createdAt: row.createdAt.toISOString(),
          })),
          nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
        }
        return ok(page)
      },
    },
  },
})
