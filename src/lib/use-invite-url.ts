import { useQuery } from '@tanstack/react-query'

import { queries } from './api'
import { inviteUrl } from './discord'

/**
 * Invite link for the bot. Uses VITE_DISCORD_CLIENT_ID when set, otherwise the
 * application id the running bot reported. Undefined until one is known.
 */
export function useInviteUrl(guildId?: string) {
  const { data: status } = useQuery(queries.status())
  const clientId: string | undefined =
    import.meta.env.VITE_DISCORD_CLIENT_ID || status?.applicationId || undefined
  return clientId ? inviteUrl(clientId, guildId) : undefined
}
