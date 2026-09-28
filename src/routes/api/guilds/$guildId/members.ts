import { createFileRoute } from '@tanstack/react-router'

import { DiscordApiError, searchMembers } from '#/server/discord.server'
import { fail, findActiveGuild, guildNotFound, ok } from '#/server/http.server'

export const Route = createFileRoute('/api/guilds/$guildId/members')({
  server: {
    handlers: {
      // ?query= matches the start of a username or nickname (Discord's search).
      GET: async ({ params, request }) => {
        if (!(await findActiveGuild(params.guildId))) return guildNotFound()
        const query = new URL(request.url).searchParams.get('query')?.trim() ?? ''
        if (query.length === 0 || query.length > 32) {
          return fail(400, 'Type 1–32 characters of a name to search.')
        }
        try {
          return ok(await searchMembers(params.guildId, query))
        } catch (error) {
          if (error instanceof DiscordApiError) return fail(502, error.message)
          throw error
        }
      },
    },
  },
})
