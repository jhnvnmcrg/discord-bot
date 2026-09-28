import { createFileRoute } from '@tanstack/react-router'

import { listGuildSummaries } from '#/server/guilds.server'
import { ok } from '#/server/http.server'

export const Route = createFileRoute('/api/guilds/')({
  server: {
    handlers: {
      GET: async () => ok(await listGuildSummaries()),
    },
  },
})
