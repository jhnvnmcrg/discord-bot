import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRightIcon } from 'lucide-react'

import { GuildIcon } from '#/components/guild-icon'
import { PageHeader } from '#/components/page-header'
import { ActivityChart, StatTiles, useStats } from '#/components/stats'
import { Badge } from '#/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Skeleton } from '#/components/ui/skeleton'
import { queries } from '#/lib/api'

export const Route = createFileRoute('/dashboard/$guildId/')({
  component: GuildOverview,
})

function SetupRow({
  to,
  label,
  status,
  on,
}: {
  to:
    | '/dashboard/$guildId/commands'
    | '/dashboard/$guildId/responders'
    | '/dashboard/$guildId/schedules'
    | '/dashboard/$guildId/reminders'
    | '/dashboard/$guildId/welcome'
  label: string
  status: string
  on: boolean
}) {
  const { guildId } = Route.useParams()
  return (
    <li>
      <Link
        to={to}
        params={{ guildId }}
        className="flex items-center gap-3 rounded-md px-2 py-2.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex-1 font-medium">{label}</span>
        <Badge variant={on ? 'default' : 'secondary'}>{status}</Badge>
        <ChevronRightIcon aria-hidden className="size-4 text-muted-foreground" />
      </Link>
    </li>
  )
}

function GuildOverview() {
  const { guildId } = Route.useParams()
  const { data: guild } = useSuspenseQuery(queries.guild(guildId))
  const stats = useStats(guildId)
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

  return (
    <>
      <div className="flex items-center gap-4">
        <GuildIcon guild={guild} className="size-14 rounded-2xl text-base" />
        <PageHeader
          title={guild.name}
          description={`${guild.memberCount.toLocaleString()} members`}
        />
      </div>
      <StatTiles totals={stats?.totals} />
      <ActivityChart stats={stats} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Set up</CardTitle>
            <CardDescription>What the bot does in this server</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="-mx-2 flex flex-col">
              <SetupRow
                to="/dashboard/$guildId/commands"
                label="Slash commands"
                status={plural(guild.commandCount, 'command')}
                on={guild.commandCount > 0}
              />
              <SetupRow
                to="/dashboard/$guildId/responders"
                label="Auto-responders"
                status={plural(guild.responderCount, 'trigger')}
                on={guild.responderCount > 0}
              />
              <SetupRow
                to="/dashboard/$guildId/schedules"
                label="Scheduled messages"
                status={plural(guild.scheduleCount, 'message')}
                on={guild.scheduleCount > 0}
              />
              <SetupRow
                to="/dashboard/$guildId/reminders"
                label="Reminders"
                status={
                  guild.remindersEnabled
                    ? plural(guild.reminderCount, 'upcoming reminder')
                    : 'Off'
                }
                on={guild.remindersEnabled}
              />
              <SetupRow
                to="/dashboard/$guildId/welcome"
                label="Welcome message"
                status={guild.welcomeEnabled ? 'On' : 'Off'}
                on={guild.welcomeEnabled}
              />
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Most-used commands</CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            {!stats ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-6" />
                <Skeleton className="h-6" />
                <Skeleton className="h-6" />
              </div>
            ) : stats.topCommands.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No commands have been used yet.
              </p>
            ) : (
              <ol className="flex flex-col gap-2">
                {stats.topCommands.map((command) => (
                  <li key={command.name} className="flex items-center justify-between gap-4">
                    <code className="truncate text-sm">/{command.name}</code>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {command.count.toLocaleString()} {command.count === 1 ? 'use' : 'uses'}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
