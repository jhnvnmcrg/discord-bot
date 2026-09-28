import { timingSafeEqual } from 'node:crypto'

import { auth } from '@clerk/tanstack-react-start/server'
import { createMiddleware } from '@tanstack/react-start'

function adminUserIds() {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  )
}

function apiKeyMatches(provided: string | null) {
  const expected = process.env.DASHBOARD_API_KEY
  if (!expected || !provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Clerk sign-up is open by default, so being signed in is not enough:
 * only user ids listed in ADMIN_USER_IDS may manage the bot. With the
 * variable unset, nobody is an admin.
 */
export async function getViewer() {
  const { userId } = await auth()
  return { userId, isAdmin: !!userId && adminUserIds().has(userId) }
}

/** Guards every /api route: a matching `x-api-key` header, or an admin session. */
export const requireAdmin = createMiddleware().server(
  async ({ request, next }) => {
    const apiKey = request.headers.get('x-api-key')
    if (apiKey !== null) {
      // Never fall back to the session: CSRF checks are skipped for keyed requests.
      if (apiKeyMatches(apiKey)) return next()
      return Response.json({ error: 'Invalid API key.' }, { status: 401 })
    }

    const { userId, isAdmin } = await getViewer()
    if (!userId) {
      return Response.json(
        { error: 'Sign in to use the API, or send an x-api-key header.' },
        { status: 401 },
      )
    }
    if (!isAdmin) {
      return Response.json(
        { error: 'Your account is not in ADMIN_USER_IDS.' },
        { status: 403 },
      )
    }
    return next()
  },
)
