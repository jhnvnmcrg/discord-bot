import { createFileRoute } from '@tanstack/react-router'

import { sendMessageInput } from '#/lib/schemas'
import { getViewer } from '#/server/auth.server'
import { DiscordApiError } from '#/server/discord.server'
import {
  fail,
  findActiveGuild,
  guildNotFound,
  invalid,
  ok,
  readJson,
} from '#/server/http.server'
import { sendMessageNow } from '#/server/send-message.server'

export const Route = createFileRoute('/api/guilds/$guildId/messages')({
  server: {
    handlers: {
      // Sends a message right away, as the bot, to a channel or a member's DMs.
      POST: async ({ params, request }) => {
        const guild = await findActiveGuild(params.guildId)
        if (!guild) return guildNotFound()

        const parsed = sendMessageInput.safeParse(await readJson(request))
        if (!parsed.success) return invalid(parsed.error)

        // Recorded for the activity log; null when sent with the API key.
        const { userId } = await getViewer()
        try {
          return ok(await sendMessageNow(parsed.data, guild, userId), 201)
        } catch (error) {
          if (error instanceof DiscordApiError) {
            return fail(error.status === 400 ? 400 : 502, error.message)
          }
          throw error
        }
      },
    },
  },
})
