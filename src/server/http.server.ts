import { and, eq, isNull } from 'drizzle-orm'
import type { z } from 'zod'

import { db } from '#/db/index.ts'
import { guilds } from '#/db/schema.ts'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export function ok(data: unknown, status = 200) {
  return Response.json(data, { status, headers: NO_STORE })
}

export function noContent() {
  return new Response(null, { status: 204, headers: NO_STORE })
}

export function fail(status: number, error: string) {
  return Response.json({ error }, { status, headers: NO_STORE })
}

export function invalid(error: z.ZodError) {
  return Response.json(
    {
      error: 'Some fields are invalid.',
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    },
    { status: 400, headers: NO_STORE },
  )
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}

/** Parses a numeric `$id` route param; undefined when it is not a positive integer. */
export function parseId(raw: string) {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : undefined
}

/** A guild the bot is currently in, or undefined. */
export async function findActiveGuild(guildId: string) {
  const [guild] = await db
    .select()
    .from(guilds)
    .where(and(eq(guilds.id, guildId), isNull(guilds.leftAt)))
  return guild
}

export function guildNotFound() {
  return fail(404, 'The bot is not in that server.')
}

export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  if ('code' in error && error.code === '23505') return true
  return 'cause' in error && isUniqueViolation(error.cause)
}
