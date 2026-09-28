import { useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ActivityIcon } from 'lucide-react'
import { z } from 'zod'

import { PageHeader } from '#/components/page-header'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { Spinner } from '#/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import type { ActivityType } from '#/db/schema'
import { queries } from '#/lib/api'
import type { ActivityDto } from '#/lib/api-types'

const FILTERS = [
  { value: 'all', label: 'Everything' },
  { value: 'command', label: 'Commands' },
  { value: 'autoresponse', label: 'Auto-replies' },
  { value: 'member_join', label: 'Joins' },
  { value: 'member_leave', label: 'Leaves' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'reminder', label: 'Reminders' },
  { value: 'message', label: 'Sent from web' },
  { value: 'error', label: 'Errors' },
] as const

const EVENT_LABELS: Record<ActivityType, string> = {
  command: 'Command',
  autoresponse: 'Auto-reply',
  member_join: 'Joined',
  member_leave: 'Left',
  scheduled: 'Scheduled',
  reminder: 'Reminder',
  message: 'Sent',
  error: 'Error',
}

const searchSchema = z.object({
  type: z.enum(FILTERS.map((f) => f.value)).optional().catch(undefined),
})

export const Route = createFileRoute('/dashboard/$guildId/activity')({
  staticData: { title: 'Activity' },
  validateSearch: searchSchema,
  component: ActivityPage,
})

const timeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function describe(entry: ActivityDto) {
  const meta = entry.metadata ?? {}
  switch (entry.type) {
    case 'command':
      return `/${entry.name}`
    case 'autoresponse':
      return typeof meta.trigger === 'string' ? `Matched "${meta.trigger}"` : 'Replied'
    case 'scheduled':
      if (meta.status === 'missed') {
        return `Skipped "${entry.name}": the bot was offline when it was due`
      }
      return meta.manual ? `Sent "${entry.name}" (Send now)` : `Sent "${entry.name}"`
    case 'reminder':
      return meta.via === 'dm' ? `Reminded by DM: ${entry.name}` : `Reminded: ${entry.name}`
    case 'message':
      return meta.target === 'dm'
        ? `DM from the dashboard: ${entry.name ?? ''}`
        : `Posted from the dashboard: ${entry.name ?? ''}`
    case 'error':
      return typeof meta.message === 'string' ? meta.message : (entry.name ?? 'Error')
    default:
      return ''
  }
}

function Who({ entry }: { entry: ActivityDto }) {
  const meta = entry.metadata ?? {}
  if (typeof meta.username === 'string') return <>{meta.username}</>
  if (entry.userId) return <code className="text-xs">{entry.userId}</code>
  return <span className="text-muted-foreground">–</span>
}

function ActivityPage() {
  const { guildId } = Route.useParams()
  const { type = 'all' } = Route.useSearch()
  const navigate = Route.useNavigate()
  const activity = useInfiniteQuery(
    queries.activity(guildId, type === 'all' ? undefined : type),
  )
  const items = activity.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <>
      <PageHeader
        title="Activity"
        description="What the bot has done in this server over the last 30 days, newest first."
      />
      <Tabs
        value={type}
        onValueChange={(value) =>
          navigate({
            search: { type: value === 'all' ? undefined : (value as ActivityType) },
            replace: true,
          })
        }
      >
        <TabsList className="max-w-full overflow-x-auto">
          {FILTERS.map((filter) => (
            <TabsTrigger key={filter.value} value={filter.value}>
              {filter.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {activity.isPending ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ActivityIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing here yet</EmptyTitle>
            <EmptyDescription>
              Commands, auto-replies, joins and errors are logged as they happen.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44 pl-4">When</TableHead>
                <TableHead className="w-28">Event</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead className="hidden md:table-cell">Member</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="pl-4 text-muted-foreground tabular-nums">
                    <time dateTime={entry.createdAt}>
                      {timeFormat.format(new Date(entry.createdAt))}
                    </time>
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.type === 'error' ? 'destructive' : 'secondary'}>
                      {EVENT_LABELS[entry.type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-0">
                    <span className="block truncate">{describe(entry)}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Who entry={entry} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {activity.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            onClick={() => activity.fetchNextPage()}
            disabled={activity.isFetchingNextPage}
          >
            {activity.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
            Load older events
          </Button>
        </div>
      ) : null}
    </>
  )
}
