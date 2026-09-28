import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { PlusIcon, PowerOffIcon, ServerIcon } from 'lucide-react'

import { GuildIcon } from '#/components/guild-icon'
import { PageHeader } from '#/components/page-header'
import { ActivityChart, StatTiles, useStats } from '#/components/stats'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { queries } from '#/lib/api'
import { useInviteUrl } from '#/lib/use-invite-url'

export const Route = createFileRoute('/dashboard/')({
  component: Overview,
})

function OfflineAlert() {
  const { data: status } = useQuery(queries.status())
  if (!status || status.online) return null
  return (
    <Alert>
      <PowerOffIcon />
      <AlertTitle>
        {status.lastHeartbeat ? 'The bot is offline' : 'The bot has not started yet'}
      </AlertTitle>
      <AlertDescription>
        <p>
          Start it with <code>npm run bot</code>. Changes you make here are saved
          and apply as soon as it connects.
        </p>
      </AlertDescription>
    </Alert>
  )
}

function ServerGrid() {
  const { data: guilds } = useQuery(queries.guilds())
  const invite = useInviteUrl()

  if (!guilds) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    )
  }

  if (guilds.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ServerIcon />
          </EmptyMedia>
          <EmptyTitle>Add the bot to a server</EmptyTitle>
          <EmptyDescription>
            Servers show up here as soon as the bot joins them. You need the
            Manage Server permission on the server you pick.
          </EmptyDescription>
        </EmptyHeader>
        {invite ? (
          <EmptyContent>
            <Button asChild>
              <a href={invite} target="_blank" rel="noreferrer">
                <PlusIcon data-icon="inline-start" />
                Add to Discord
              </a>
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {guilds.map((guild) => (
        <Link
          key={guild.id}
          to="/dashboard/$guildId"
          params={{ guildId: guild.id }}
          className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Card className="h-full py-4 transition-colors hover:bg-accent">
            <CardHeader className="flex items-center gap-3 px-4">
              <GuildIcon guild={guild} className="size-12 rounded-xl" />
              <div className="flex min-w-0 flex-col gap-1">
                <CardTitle className="truncate">{guild.name}</CardTitle>
                <CardDescription>
                  {guild.memberCount.toLocaleString()} members,{' '}
                  {guild.commandCount} {guild.commandCount === 1 ? 'command' : 'commands'}
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  )
}

function Overview() {
  const stats = useStats()
  const invite = useInviteUrl()

  return (
    <>
      <PageHeader
        title="All servers"
        description="Totals across every server the bot is in. Pick a server to edit its commands and messages."
        actions={
          invite ? (
            <Button variant="secondary" asChild>
              <a href={invite} target="_blank" rel="noreferrer">
                <PlusIcon data-icon="inline-start" />
                Add to a server
              </a>
            </Button>
          ) : null
        }
      />
      <OfflineAlert />
      <StatTiles totals={stats?.totals} />
      <ActivityChart stats={stats} />
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Servers</h2>
        <ServerGrid />
      </section>
    </>
  )
}
