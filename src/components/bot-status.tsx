import { useQuery } from '@tanstack/react-query'
import { cn } from 'cn'

import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { queries } from '#/lib/api'
import { initials } from '#/lib/discord'

/** Bot identity + presence, shown in the sidebar footer. */
export function BotStatus() {
  const { data: status } = useQuery(queries.status())
  const name = status?.username ?? 'Your bot'

  const detail = !status
    ? 'Checking…'
    : status.online
      ? `Online, ${status.ping ?? '–'} ms ping`
      : status.lastHeartbeat
        ? 'Offline'
        : 'Never started'

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar className="size-8">
        <AvatarImage src={status?.avatar ?? undefined} alt="" />
        <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
          {initials(name)}
        </AvatarFallback>
        <AvatarBadge
          className={cn(
            'ring-sidebar',
            status?.online ? 'bg-success' : 'bg-muted-foreground',
          )}
        />
      </Avatar>
      <div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
        <span className="truncate text-sm font-semibold text-sidebar-accent-foreground">
          {name}
        </span>
        <span className="truncate text-xs text-muted-foreground">{detail}</span>
      </div>
    </div>
  )
}
