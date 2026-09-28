import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { autoResponders } from '#/db/schema.ts'
import { responderFields, responderInput } from '#/lib/schemas'
import {
  fail,
  invalid,
  noContent,
  ok,
  parseId,
  readJson,
} from '#/server/http.server'
import { notifyBot } from '#/server/notify.server'

const notFound = () => fail(404, 'That auto-responder does not exist.')

function whereResponder(guildId: string, id: number) {
  return and(eq(autoResponders.id, id), eq(autoResponders.guildId, guildId))
}

export const Route = createFileRoute('/api/guilds/$guildId/responders/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = parseId(params.id)
        if (!id) return notFound()
        const [row] = await db
          .select()
          .from(autoResponders)
          .where(whereResponder(params.guildId, id))
        return row ? ok(row) : notFound()
      },

      PATCH: async ({ params, request }) => {
        const id = parseId(params.id)
        if (!id) return notFound()

        const patch = responderFields.partial().safeParse(await readJson(request))
        if (!patch.success) return invalid(patch.error)

        const [existing] = await db
          .select()
          .from(autoResponders)
          .where(whereResponder(params.guildId, id))
        if (!existing) return notFound()

        const merged = responderInput.safeParse({ ...existing, ...patch.data })
        if (!merged.success) return invalid(merged.error)

        const [updated] = await db
          .update(autoResponders)
          .set(merged.data)
          .where(whereResponder(params.guildId, id))
          .returning()
        await notifyBot('responders', params.guildId)
        return ok(updated)
      },

      DELETE: async ({ params }) => {
        const id = parseId(params.id)
        if (!id) return notFound()
        const deleted = await db
          .delete(autoResponders)
          .where(whereResponder(params.guildId, id))
          .returning({ id: autoResponders.id })
        if (deleted.length === 0) return notFound()
        await notifyBot('responders', params.guildId)
        return noContent()
      },
    },
  },
})
