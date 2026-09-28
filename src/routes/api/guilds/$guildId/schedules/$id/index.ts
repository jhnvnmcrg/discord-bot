import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { scheduledMessages } from '#/db/schema.ts'
import { scheduledMessageFields, scheduledMessageInput } from '#/lib/schemas'
import { DiscordApiError } from '#/server/discord.server'
import {
  fail,
  invalid,
  noContent,
  ok,
  parseId,
  readJson,
} from '#/server/http.server'
import {
  isPastOneTime,
  planNextRun,
  resolveMention,
} from '#/server/scheduled.server'

const notFound = () => fail(404, 'That scheduled message does not exist.')

function whereSchedule(guildId: string, id: number) {
  return and(eq(scheduledMessages.id, id), eq(scheduledMessages.guildId, guildId))
}

export const Route = createFileRoute('/api/guilds/$guildId/schedules/$id/')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = parseId(params.id)
        if (!id) return notFound()
        const [row] = await db
          .select()
          .from(scheduledMessages)
          .where(whereSchedule(params.guildId, id))
        return row ? ok(row) : notFound()
      },

      // Partial update, merged onto the stored row and validated as a whole.
      // The next run is recomputed on every save.
      PATCH: async ({ params, request }) => {
        const id = parseId(params.id)
        if (!id) return notFound()

        const patch = scheduledMessageFields
          .partial()
          .safeParse(await readJson(request))
        if (!patch.success) return invalid(patch.error)

        const [existing] = await db
          .select()
          .from(scheduledMessages)
          .where(whereSchedule(params.guildId, id))
        if (!existing) return notFound()

        const merged = scheduledMessageInput.safeParse({
          ...existing,
          mentionUserId: existing.mention?.id ?? null,
          ...patch.data,
        })
        if (!merged.success) return invalid(merged.error)

        // A sent one-time message can still be edited or toggled; only a
        // changed time has to be in the future.
        const timingChanged =
          JSON.stringify(merged.data.schedule) !== JSON.stringify(existing.schedule) ||
          merged.data.timezone !== existing.timezone
        if (timingChanged && isPastOneTime(merged.data)) {
          return fail(400, 'That time has already passed. Pick a time in the future.')
        }

        const { mentionUserId, ...fields } = merged.data
        let mention: Awaited<ReturnType<typeof resolveMention>>
        try {
          mention = await resolveMention(params.guildId, mentionUserId, existing.mention)
        } catch (error) {
          if (error instanceof DiscordApiError) {
            return fail(error.status === 400 ? 400 : 502, error.message)
          }
          throw error
        }

        const [updated] = await db
          .update(scheduledMessages)
          .set({ ...fields, mention, nextRunAt: planNextRun(merged.data) })
          .where(whereSchedule(params.guildId, id))
          .returning()
        return ok(updated)
      },

      DELETE: async ({ params }) => {
        const id = parseId(params.id)
        if (!id) return notFound()
        const deleted = await db
          .delete(scheduledMessages)
          .where(whereSchedule(params.guildId, id))
          .returning({ id: scheduledMessages.id })
        return deleted.length ? noContent() : notFound()
      },
    },
  },
})
