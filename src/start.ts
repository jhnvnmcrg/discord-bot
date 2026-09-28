import { clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const csrfMiddleware = createCsrfMiddleware({
  // Server functions, plus cookie-authenticated writes to the REST API.
  // Requests carrying x-api-key are machine clients (no Origin header) and
  // are authenticated by the key instead of the session cookie.
  filter: (ctx) =>
    ctx.handlerType === 'serverFn' ||
    (ctx.pathname.startsWith('/api/') &&
      !SAFE_METHODS.has(ctx.request.method) &&
      !ctx.request.headers.has('x-api-key')),
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, clerkMiddleware()],
}))
