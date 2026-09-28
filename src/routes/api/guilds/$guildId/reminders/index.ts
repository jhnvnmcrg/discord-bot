import { createFileRoute } from '@tanstack/react-router'
import { and, asc, eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { reminders } from '#/db/schema.ts'
import { findActiveGuild, guildNotFound, ok } from '#/server/http.server'

export const Route = createFileRoute('/api/guilds/$guildId/reminders/')({
  server: {
    handlers: {
      // Members' upcoming reminders, soonest first.
      GET: async ({ params }) => {
        if (!(await findActiveGuild(params.guildId))) return guildNotFound()
        const rows = await db
          .select()
          .from(reminders)
          .where(
            and(eq(reminders.guildId, params.guildId), eq(reminders.status, 'pending')),
          )
          .orderBy(asc(reminders.dueAt))
          .limit(200)
        return ok(rows)
      },
    },
  },
})
