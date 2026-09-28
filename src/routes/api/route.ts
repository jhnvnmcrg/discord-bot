import { createFileRoute } from '@tanstack/react-router'

import { requireAdmin } from '#/server/auth.server'

// Route-level server middleware runs for every server route nested under /api.
export const Route = createFileRoute('/api')({
  server: {
    middleware: [requireAdmin],
  },
})
