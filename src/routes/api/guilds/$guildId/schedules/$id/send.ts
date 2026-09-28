import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { scheduledMessages } from '#/db/schema.ts'
import { DiscordApiError } from '#/server/discord.server'
import {
  fail,
  findActiveGuild,
  guildNotFound,
  ok,
  parseId,
} from '#/server/http.server'
import { sendScheduledNow } from '#/server/scheduled.server'

export const Route = createFileRoute('/api/guilds/$guildId/schedules/$id/send')({
  server: {
    handlers: {
      // Sends the message immediately without changing its schedule.
      POST: async ({ params }) => {
        const id = parseId(params.id)
        if (!id) return fail(404, 'That scheduled message does not exist.')
        const guild = await findActiveGuild(params.guildId)
        if (!guild) return guildNotFound()

        const [row] = await db
          .select()
          .from(scheduledMessages)
          .where(
            and(
              eq(scheduledMessages.id, id),
              eq(scheduledMessages.guildId, params.guildId),
            ),
          )
        if (!row) return fail(404, 'That scheduled message does not exist.')

        try {
          return ok(await sendScheduledNow(row, guild))
        } catch (error) {
          if (error instanceof DiscordApiError) {
            return fail(error.status === 400 ? 400 : 502, error.message)
          }
          throw error
        }
      },
    },
  },
})
