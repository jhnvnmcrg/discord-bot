import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { customCommands } from '#/db/schema.ts'
import { commandFields, commandInput } from '#/lib/schemas'
import {
  fail,
  invalid,
  isUniqueViolation,
  noContent,
  ok,
  parseId,
  readJson,
} from '#/server/http.server'
import { notifyBot } from '#/server/notify.server'

const notFound = () => fail(404, 'That command does not exist.')

function whereCommand(guildId: string, id: number) {
  return and(eq(customCommands.id, id), eq(customCommands.guildId, guildId))
}

export const Route = createFileRoute('/api/guilds/$guildId/commands/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = parseId(params.id)
        if (!id) return notFound()
        const [row] = await db
          .select()
          .from(customCommands)
          .where(whereCommand(params.guildId, id))
        return row ? ok(row) : notFound()
      },

      // Partial update: the patch is merged onto the stored command, then the
      // whole result is validated so cross-field rules still hold.
      PATCH: async ({ params, request }) => {
        const id = parseId(params.id)
        if (!id) return notFound()

        const patch = commandFields.partial().safeParse(await readJson(request))
        if (!patch.success) return invalid(patch.error)

        const [existing] = await db
          .select()
          .from(customCommands)
          .where(whereCommand(params.guildId, id))
        if (!existing) return notFound()

        const merged = commandInput.safeParse({ ...existing, ...patch.data })
        if (!merged.success) return invalid(merged.error)

        try {
          const [updated] = await db
            .update(customCommands)
            .set(merged.data)
            .where(whereCommand(params.guildId, id))
            .returning()
          await notifyBot('commands', params.guildId)
          return ok(updated)
        } catch (error) {
          if (isUniqueViolation(error)) {
            return fail(409, `/${merged.data.name} already exists in this server.`)
          }
          throw error
        }
      },

      DELETE: async ({ params }) => {
        const id = parseId(params.id)
        if (!id) return notFound()
        const deleted = await db
          .delete(customCommands)
          .where(whereCommand(params.guildId, id))
          .returning({ id: customCommands.id })
        if (deleted.length === 0) return notFound()
        await notifyBot('commands', params.guildId)
        return noContent()
      },
    },
  },
})
