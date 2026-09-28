import { createFileRoute } from '@tanstack/react-router'
import { asc, count, eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { scheduledMessages } from '#/db/schema.ts'
import { scheduledMessageInput } from '#/lib/schemas'
import {
  fail,
  findActiveGuild,
  guildNotFound,
  invalid,
  ok,
  readJson,
} from '#/server/http.server'
import {
  isPastOneTime,
  MAX_SCHEDULES_PER_GUILD,
  planNextRun,
} from '#/server/scheduled.server'

export const Route = createFileRoute('/api/guilds/$guildId/schedules/')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!(await findActiveGuild(params.guildId))) return guildNotFound()
        const rows = await db
          .select()
          .from(scheduledMessages)
          .where(eq(scheduledMessages.guildId, params.guildId))
          .orderBy(asc(scheduledMessages.createdAt))
        return ok(rows)
      },

      POST: async ({ params, request }) => {
        const { guildId } = params
        if (!(await findActiveGuild(guildId))) return guildNotFound()

        const parsed = scheduledMessageInput.safeParse(await readJson(request))
        if (!parsed.success) return invalid(parsed.error)
        if (isPastOneTime(parsed.data)) {
          return fail(400, 'That time has already passed. Pick a time in the future.')
        }

        const [{ total }] = await db
          .select({ total: count() })
          .from(scheduledMessages)
          .where(eq(scheduledMessages.guildId, guildId))
        if (total >= MAX_SCHEDULES_PER_GUILD) {
          return fail(
            409,
            `A server can have at most ${MAX_SCHEDULES_PER_GUILD} scheduled messages.`,
          )
        }

        // The bot polls for due rows, so no NOTIFY is needed here.
        const [created] = await db
          .insert(scheduledMessages)
          .values({ ...parsed.data, guildId, nextRunAt: planNextRun(parsed.data) })
          .returning()
        return ok(created, 201)
      },
    },
  },
})
