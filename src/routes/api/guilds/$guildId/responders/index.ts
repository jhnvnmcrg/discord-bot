import { createFileRoute } from '@tanstack/react-router'
import { asc, eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { autoResponders } from '#/db/schema.ts'
import { responderInput } from '#/lib/schemas'
import {
  findActiveGuild,
  guildNotFound,
  invalid,
  ok,
  readJson,
} from '#/server/http.server'
import { notifyBot } from '#/server/notify.server'

export const Route = createFileRoute('/api/guilds/$guildId/responders/')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!(await findActiveGuild(params.guildId))) return guildNotFound()
        const rows = await db
          .select()
          .from(autoResponders)
          .where(eq(autoResponders.guildId, params.guildId))
          .orderBy(asc(autoResponders.createdAt))
        return ok(rows)
      },

      POST: async ({ params, request }) => {
        const { guildId } = params
        if (!(await findActiveGuild(guildId))) return guildNotFound()

        const parsed = responderInput.safeParse(await readJson(request))
        if (!parsed.success) return invalid(parsed.error)

        const [created] = await db
          .insert(autoResponders)
          .values({ ...parsed.data, guildId })
          .returning()
        await notifyBot('responders', guildId)
        return ok(created, 201)
      },
    },
  },
})
