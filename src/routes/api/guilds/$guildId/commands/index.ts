import { createFileRoute } from '@tanstack/react-router'
import { asc, count, eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { customCommands } from '#/db/schema.ts'
import { commandInput, MAX_COMMANDS_PER_GUILD } from '#/lib/schemas'
import {
  fail,
  findActiveGuild,
  guildNotFound,
  invalid,
  isUniqueViolation,
  ok,
  readJson,
} from '#/server/http.server'
import { notifyBot } from '#/server/notify.server'

export const Route = createFileRoute('/api/guilds/$guildId/commands/')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!(await findActiveGuild(params.guildId))) return guildNotFound()
        const rows = await db
          .select()
          .from(customCommands)
          .where(eq(customCommands.guildId, params.guildId))
          .orderBy(asc(customCommands.name))
        return ok(rows)
      },

      POST: async ({ params, request }) => {
        const { guildId } = params
        if (!(await findActiveGuild(guildId))) return guildNotFound()

        const parsed = commandInput.safeParse(await readJson(request))
        if (!parsed.success) return invalid(parsed.error)

        const [{ total }] = await db
          .select({ total: count() })
          .from(customCommands)
          .where(eq(customCommands.guildId, guildId))
        if (total >= MAX_COMMANDS_PER_GUILD) {
          return fail(
            409,
            `Discord allows ${MAX_COMMANDS_PER_GUILD} commands per server. Delete one first.`,
          )
        }

        try {
          const [created] = await db
            .insert(customCommands)
            .values({ ...parsed.data, guildId })
            .returning()
          await notifyBot('commands', guildId)
          return ok(created, 201)
        } catch (error) {
          if (isUniqueViolation(error)) {
            return fail(409, `/${parsed.data.name} already exists in this server.`)
          }
          throw error
        }
      },
    },
  },
})
