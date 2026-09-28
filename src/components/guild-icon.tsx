import { cn } from 'cn'

import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { guildIconUrl, initials } from '#/lib/discord'

/** Discord-style server icon: a rounded square with an initials fallback. */
export function GuildIcon({
  guild,
  className,
}: {
  guild: { id: string; name: string; icon: string | null }
  className?: string
}) {
  return (
    <Avatar className={cn('size-8 rounded-lg', className)}>
      <AvatarImage src={guildIconUrl(guild)} alt="" />
      <AvatarFallback className="rounded-lg bg-primary/20 text-xs font-semibold text-foreground">
        {initials(guild.name)}
      </AvatarFallback>
    </Avatar>
  )
}
