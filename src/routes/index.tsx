import { Show, SignInButton, UserButton } from '@clerk/tanstack-react-start'
import { createFileRoute, Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { ArrowRightIcon, HashIcon, PlusIcon } from 'lucide-react'

import { DiscordMessage } from '#/components/discord-message'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import { initials, inviteUrl } from '#/lib/discord'
import { fetchPublicBot } from '#/lib/public-bot.functions'

export const Route = createFileRoute('/')({
  loader: () => fetchPublicBot(),
  component: Home,
})

function JoinLine({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-1 text-sm text-muted-foreground">
      <ArrowRightIcon aria-hidden className="ml-3 size-4 text-success" />
      <span>
        <span className="font-medium text-foreground">{name}</span> just joined
        the server.
      </span>
    </div>
  )
}

/** A mock #general channel: one exchange for each thing the bot does. */
function ChannelPreview({
  botName,
  avatar,
}: {
  botName: string
  avatar?: string
}) {
  return (
    <figure className="overflow-hidden rounded-xl border bg-message shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold text-white">
        <HashIcon aria-hidden className="size-5 text-muted-foreground" />
        general
      </div>
      <div className="flex flex-col py-3">
        <JoinLine name="alex" />
        <DiscordMessage
          author={botName}
          avatarUrl={avatar}
          content="Welcome to {server}, {user}! Grab a role in #roles and say hi."
          className="rounded-none py-2"
        />
        <DiscordMessage
          author={botName}
          avatarUrl={avatar}
          invokedBy={{ user: 'alex', command: 'rules' }}
          embed={{
            title: 'Server rules',
            description: 'Be kind. Keep it on topic. No spam or self-promo.',
            color: '#5865f2',
          }}
          className="rounded-none py-2"
        />
        <DiscordMessage
          author="alex"
          isBot={false}
          content="when is game night?"
          className="rounded-none py-2"
        />
        <DiscordMessage
          author={botName}
          avatarUrl={avatar}
          content="Game night is every Friday at 8pm in #voice-lounge."
          className="rounded-none py-2"
        />
      </div>
      <figcaption className="sr-only">
        Example: a welcome message, a /rules command reply, and an automatic
        answer to a question.
      </figcaption>
    </figure>
  )
}

function Home() {
  const bot = Route.useLoaderData()
  const botName = bot.username ?? 'Your bot'
  const invite = bot.clientId ? inviteUrl(bot.clientId) : undefined

  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
        <div className="flex items-center gap-2 font-semibold text-white">
          <Avatar className="size-8">
            <AvatarImage src={bot.avatar ?? undefined} alt="" />
            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
              {initials(botName)}
            </AvatarFallback>
          </Avatar>
          {botName}
        </div>
        <div className="flex items-center gap-3">
          <Show when="signed-in">
            <UserButton />
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal" forceRedirectUrl="/dashboard">
              <Button variant="ghost">Sign in</Button>
            </SignInButton>
          </Show>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 py-10 md:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:gap-16">
        <div className="flex flex-col gap-6">
          <h1 className="text-5xl leading-[1.05] font-extrabold tracking-tight text-balance text-white md:text-6xl">
            Run {botName} from one place.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            Write slash commands, set up automatic replies and greet new members
            for every server the bot is in. Save a change here and it's live in
            Discord a few seconds later.
          </p>
          <div className="flex flex-wrap gap-3">
            {invite ? (
              <Button size="lg" asChild>
                <a href={invite} target="_blank" rel="noreferrer">
                  <PlusIcon data-icon="inline-start" />
                  Add to Discord
                </a>
              </Button>
            ) : null}
            <Show when="signed-in">
              <Button size="lg" variant="secondary" asChild>
                <Link to="/dashboard">Open dashboard</Link>
              </Button>
            </Show>
            <Show when="signed-out">
              <SignInButton mode="modal" forceRedirectUrl="/dashboard">
                <Button size="lg" variant="secondary">
                  Sign in to the dashboard
                </Button>
              </SignInButton>
            </Show>
          </div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              aria-hidden
              className={cn(
                'size-2 rounded-full',
                bot.online ? 'bg-success' : 'bg-muted-foreground',
              )}
            />
            {bot.online ? `${botName} is online` : `${botName} is offline`}
          </p>
        </div>
        <ChannelPreview botName={botName} avatar={bot.avatar ?? undefined} />
      </main>
    </div>
  )
}
