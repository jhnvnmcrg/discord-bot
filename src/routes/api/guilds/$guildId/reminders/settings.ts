import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { reminderSettings } from '#/db/schema.ts'
import type { ReminderSettingsDto } from '#/lib/api-types'
import { reminderSettingsInput } from '#/lib/schemas'
import {
  findActiveGuild,
  guildNotFound,
  invalid,
  ok,
  readJson,
} from '#/server/http.server'
import { notifyBot } from '#/server/notify.server'

export const Route = createFileRoute('/api/guilds/$guildId/reminders/settings')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { guildId } = params
        if (!(await findActiveGuild(guildId))) return guildNotFound()
        const [row] = await db
          .select()
          .from(reminderSettings)
          .where(eq(reminderSettings.guildId, guildId))
        const defaults: ReminderSettingsDto = {
          guildId,
          enabled: true,
          defaultTimezone: 'UTC',
          maxPerMember: 10,
          updatedAt: null,
        }
        return ok(row ?? defaults)
      },

      // Turning reminders off makes the bot unregister /remind in this server.
      PUT: async ({ params, request }) => {
        const { guildId } = params
        if (!(await findActiveGuild(guildId))) return guildNotFound()

        const parsed = reminderSettingsInput.safeParse(await readJson(request))
        if (!parsed.success) return invalid(parsed.error)

        const [saved] = await db
          .insert(reminderSettings)
          .values({ ...parsed.data, guildId })
          .onConflictDoUpdate({
            target: reminderSettings.guildId,
            set: { ...parsed.data, updatedAt: new Date() },
          })
          .returning()
        await notifyBot('reminders', guildId)
        return ok(saved)
      },
    },
  },
})
