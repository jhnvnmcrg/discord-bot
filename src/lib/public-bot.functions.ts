import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { botStatus } from '#/db/schema.ts'
import { isBotOnline } from '#/lib/bot-config'

/** Public, non-sensitive bot identity for the landing page (no auth). */
export const fetchPublicBot = createServerFn({ method: 'GET' }).handler(
  async () => {
    let row: typeof botStatus.$inferSelect | undefined
    try {
      ;[row] = await db.select().from(botStatus).where(eq(botStatus.id, 1))
    } catch (error) {
      console.error('Could not read bot_status', error)
    }
    return {
      username: row?.username ?? null,
      avatar: row?.avatar ?? null,
      online: row ? isBotOnline(row) : false,
      clientId:
        process.env.VITE_DISCORD_CLIENT_ID || row?.applicationId || null,
    }
  },
)
