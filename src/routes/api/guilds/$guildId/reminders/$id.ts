import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { reminders } from '#/db/schema.ts'
import { fail, noContent, parseId } from '#/server/http.server'

export const Route = createFileRoute('/api/guilds/$guildId/reminders/$id')({
  server: {
    handlers: {
      // Cancels a member's pending reminder.
      DELETE: async ({ params }) => {
        const id = parseId(params.id)
        const deleted = id
          ? await db
              .delete(reminders)
              .where(
                and(
                  eq(reminders.id, id),
                  eq(reminders.guildId, params.guildId),
                  eq(reminders.status, 'pending'),
                ),
              )
              .returning({ id: reminders.id })
          : []
        return deleted.length
          ? noContent()
          : fail(404, 'That reminder does not exist or was already sent.')
      },
    },
  },
})
