import { createServerFn } from '@tanstack/react-start'

import { getViewer } from '#/server/auth.server'

/** Who is signed in and whether they may manage the bot. UX only — /api enforces it. */
export const fetchViewer = createServerFn({ method: 'GET' }).handler(() =>
  getViewer(),
)
