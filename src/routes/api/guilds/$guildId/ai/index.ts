import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { aiChatSettings } from '#/db/schema.ts'
import { aiChatConfigured, geminiModel } from '#/lib/ai-chat'
import type { AiChatDto } from '#/lib/api-types'
import { aiChatSettingsInput } from '#/lib/schemas'
import {
  findActiveGuild,
  guildNotFound,
  invalid,
  ok,
  readJson,
} from '#/server/http.server'
import { notifyBot } from '#/server/notify.server'

export const Route = createFileRoute('/api/guilds/$guildId/ai/')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { guildId } = params
        if (!(await findActiveGuild(guildId))) return guildNotFound()
        const [row] = await db
          .select()
          .from(aiChatSettings)
          .where(eq(aiChatSettings.guildId, guildId))
        const dto: AiChatDto = {
          enabled: row?.enabled ?? true,
          persona: row?.persona ?? '',
          cooldownSeconds: row?.cooldownSeconds ?? 5,
          configured: aiChatConfigured(),
          model: geminiModel(),
        }
        return ok(dto)
      },

      PUT: async ({ params, request }) => {
        const { guildId } = params
        if (!(await findActiveGuild(guildId))) return guildNotFound()

        const parsed = aiChatSettingsInput.safeParse(await readJson(request))
        if (!parsed.success) return invalid(parsed.error)

        await db
          .insert(aiChatSettings)
          .values({ ...parsed.data, guildId })
          .onConflictDoUpdate({
            target: aiChatSettings.guildId,
            set: { ...parsed.data, updatedAt: new Date() },
          })
        await notifyBot('ai', guildId)
        const dto: AiChatDto = {
          ...parsed.data,
          configured: aiChatConfigured(),
          model: geminiModel(),
        }
        return ok(dto)
      },
    },
  },
})
