import { cn } from 'cn'
import { EyeIcon } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { initials } from '#/lib/discord'
import { type TemplateVars, tokenizeTemplate } from '#/lib/templates'

// A faithful-enough rendering of a Discord message, used to preview what the
// bot will post. Placeholders are filled with sample values.

export const SAMPLE_VARS: Required<TemplateVars> = {
  user: '@alex',
  'user.name': 'alex',
  server: 'Night Owls',
  memberCount: '128',
  channel: '#general',
}

function MessageText({
  template,
  vars = SAMPLE_VARS,
}: {
  template: string
  vars?: TemplateVars
}) {
  return (
    <p className="leading-relaxed break-words whitespace-pre-wrap">
      {tokenizeTemplate(template).map((token, index) => {
        if (token.type === 'text') return token.value
        const value = vars[token.key] ?? `{${token.key}}`
        const isMention = token.key === 'user' || token.key === 'channel'
        return isMention ? (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: tokens have no identity
            key={index}
            className="rounded-sm bg-mention px-0.5 font-medium text-mention-foreground"
          >
            {value}
          </span>
        ) : (
          value
        )
      })}
    </p>
  )
}

export type PreviewEmbed = {
  title?: string
  description?: string
  color?: string
}

export function DiscordMessage({
  author,
  avatarUrl,
  isBot = true,
  content,
  embed,
  ephemeral,
  invokedBy,
  vars,
  className,
}: {
  author: string
  avatarUrl?: string
  isBot?: boolean
  content?: string
  embed?: PreviewEmbed | null
  ephemeral?: boolean
  /** Shows the "alex used /name" line Discord puts above slash command replies. */
  invokedBy?: { user: string; command: string }
  vars?: TemplateVars
  className?: string
}) {
  const hasEmbed = embed && (embed.title?.trim() || embed.description?.trim())
  return (
    <div
      className={cn(
        'rounded-lg bg-message px-4 py-3 text-[0.9375rem] text-foreground',
        className,
      )}
    >
      {invokedBy ? (
        <div className="mb-1 flex items-center gap-1 pl-12 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{invokedBy.user}</span>
          used
          <span className="font-medium text-mention-foreground">
            /{invokedBy.command || 'command'}
          </span>
        </div>
      ) : null}
      <div className="flex gap-3">
        <Avatar className="size-10">
          <AvatarImage src={avatarUrl} alt="" />
          <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
            {initials(author)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-white">{author}</span>
            {isBot ? (
              <span className="rounded-sm bg-primary px-1 text-[0.625rem] leading-4 font-semibold text-primary-foreground">
                APP
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">Today at 21:04</span>
          </div>
          {content?.trim() ? <MessageText template={content} vars={vars} /> : null}
          {hasEmbed ? (
            <div
              className="max-w-md rounded-sm border-l-4 bg-embed py-2 pr-4 pl-3"
              style={{ borderLeftColor: embed.color || 'var(--border)' }}
            >
              {embed.title?.trim() ? (
                <div className="font-semibold text-white">
                  <MessageText template={embed.title} vars={vars} />
                </div>
              ) : null}
              {embed.description?.trim() ? (
                <div className="text-sm">
                  <MessageText template={embed.description} vars={vars} />
                </div>
              ) : null}
            </div>
          ) : null}
          {ephemeral ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <EyeIcon aria-hidden className="size-3.5" />
              Only you can see this
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
