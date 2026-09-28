import { createFileRoute } from '@tanstack/react-router'

import { getGuildSummary } from '#/server/guilds.server'
import { guildNotFound, ok } from '#/server/http.server'

export const Route = createFileRoute('/api/guilds/$guildId/')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const guild = await getGuildSummary(params.guildId)
        return guild ? ok(guild) : guildNotFound()
      },
    },
  },
})
