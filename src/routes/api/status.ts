import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import { botStatus } from '#/db/schema.ts'
import type { BotStatusDto } from '#/lib/api-types'
import { isBotOnline } from '#/lib/bot-config'
import { ok } from '#/server/http.server'

export const Route = createFileRoute('/api/status')({
  server: {
    handlers: {
      GET: async () => {
        const [row] = await db
          .select()
          .from(botStatus)
          .where(eq(botStatus.id, 1))

        const status: BotStatusDto = row
          ? {
              online: isBotOnline(row),
              username: row.username,
              avatar: row.avatar,
              applicationId: row.applicationId,
              ping: row.ping,
              guildCount: row.guildCount,
              startedAt: row.startedAt?.toISOString() ?? null,
              lastHeartbeat: row.lastHeartbeat.toISOString(),
            }
          : {
              online: false,
              username: null,
              avatar: null,
              applicationId: null,
              ping: null,
              guildCount: 0,
              startedAt: null,
              lastHeartbeat: null,
            }
        return ok(status)
      },
    },
  },
})
