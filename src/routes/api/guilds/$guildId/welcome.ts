import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { welcomeSettings } from '#/db/schema.ts'
import type { WelcomeDto } from '#/lib/api-types'
import { welcomeInput } from '#/lib/schemas'
import { DEFAULT_WELCOME_MESSAGE } from '#/lib/templates'
import {
  findActiveGuild,
  guildNotFound,
  invalid,
  ok,
  readJson,
} from '#/server/http.server'
import { notifyBot } from '#/server/notify.server'

export const Route = createFileRoute('/api/guilds/$guildId/welcome')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { guildId } = params
        if (!(await findActiveGuild(guildId))) return guildNotFound()
        const [row] = await db
          .select()
          .from(welcomeSettings)
          .where(eq(welcomeSettings.guildId, guildId))
        if (row) return ok(row)

        // Not configured yet: answer with the defaults, without writing a row.
        const defaults: WelcomeDto = {
          guildId,
          enabled: false,
          channelId: null,
          message: DEFAULT_WELCOME_MESSAGE,
          autoRoleId: null,
          updatedAt: null,
        }
        return ok(defaults)
      },

      PUT: async ({ params, request }) => {
        const { guildId } = params
        if (!(await findActiveGuild(guildId))) return guildNotFound()

        const parsed = welcomeInput.safeParse(await readJson(request))
        if (!parsed.success) return invalid(parsed.error)

        const [saved] = await db
          .insert(welcomeSettings)
          .values({ ...parsed.data, guildId })
          .onConflictDoUpdate({
            target: welcomeSettings.guildId,
            set: { ...parsed.data, updatedAt: new Date() },
          })
          .returning()
        await notifyBot('welcome', guildId)
        return ok(saved)
      },
    },
  },
})
