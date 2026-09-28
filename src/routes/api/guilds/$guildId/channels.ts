import { createFileRoute } from '@tanstack/react-router'

import { DiscordApiError, listMessageChannels } from '#/server/discord.server'
import { fail, findActiveGuild, guildNotFound, ok } from '#/server/http.server'

export const Route = createFileRoute('/api/guilds/$guildId/channels')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!(await findActiveGuild(params.guildId))) return guildNotFound()
        try {
          return ok(await listMessageChannels(params.guildId))
        } catch (error) {
          if (error instanceof DiscordApiError) return fail(502, error.message)
          throw error
        }
      },
    },
  },
})
