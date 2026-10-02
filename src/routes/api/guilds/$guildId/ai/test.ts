import { createFileRoute } from '@tanstack/react-router'

import { db } from '#/db/index.ts'
import { botStatus } from '#/db/schema.ts'
import { aiChatConfigured, generateReply } from '#/lib/ai-chat'
import type { AiChatTestReply } from '#/lib/api-types'
import { aiChatTestInput } from '#/lib/schemas'
import {
  fail,
  findActiveGuild,
  guildNotFound,
  invalid,
  ok,
  readJson,
} from '#/server/http.server'

export const Route = createFileRoute('/api/guilds/$guildId/ai/test')({
  server: {
    handlers: {
      // Runs the same prompt the bot uses, with an unsaved persona, without
      // posting anything to Discord.
      POST: async ({ params, request }) => {
        const guild = await findActiveGuild(params.guildId)
        if (!guild) return guildNotFound()
        if (!aiChatConfigured()) {
          return fail(400, 'Set GEMINI_API_KEY in the environment to use AI chat.')
        }

        const parsed = aiChatTestInput.safeParse(await readJson(request))
        if (!parsed.success) return invalid(parsed.error)

        const [status] = await db.select({ username: botStatus.username }).from(botStatus)
        const started = Date.now()
        try {
          const { text: reply, model } = await generateReply(
            parsed.data.messages.map((m) => ({ ...m, author: 'Admin' })),
            {
              botName: status?.username ?? 'the bot',
              server: guild.name,
              persona: parsed.data.persona,
            },
          )
          const body: AiChatTestReply = { reply, model, ms: Date.now() - started }
          return ok(body)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return fail(502, `Gemini returned an error: ${message.slice(0, 300)}`)
        }
      },
    },
  },
})
