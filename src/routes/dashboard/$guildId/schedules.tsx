import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  CalendarClockIcon,
  EllipsisIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDelete } from '#/components/confirm-delete'
import { PageHeader } from '#/components/page-header'
import { ScheduleDialog } from '#/components/schedule-dialog'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { Switch } from '#/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import {
  errorMessage,
  queries,
  useDeleteSchedule,
  useSendScheduleNow,
  useUpdateSchedule,
} from '#/lib/api'
import type { ScheduleDto } from '#/lib/api-types'
import {
  describeSchedule,
  formatInZone,
  formatRelative,
} from '#/lib/schedule-format'

export const Route = createFileRoute('/dashboard/$guildId/schedules')({
  staticData: { title: 'Scheduled messages' },
  component: SchedulesPage,
})

function NextSend({ schedule }: { schedule: ScheduleDto }) {
  if (!schedule.enabled) return <span className="text-muted-foreground">Off</span>
  if (!schedule.nextRunAt) {
    return <span className="text-muted-foreground">Done</span>
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default underline decoration-dotted underline-offset-4">
          {formatRelative(schedule.nextRunAt)}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {formatInZone(schedule.nextRunAt, schedule.timezone)} (
        {schedule.timezone.replaceAll('_', ' ')})
      </TooltipContent>
    </Tooltip>
  )
}

function LastResult({ schedule }: { schedule: ScheduleDto }) {
  if (!schedule.lastRunAt || !schedule.lastResult) {
    return <span className="text-muted-foreground">Not sent yet</span>
  }
  const when = formatRelative(schedule.lastRunAt)
  if (schedule.lastResult === 'sent') {
    return (
      <span className="flex flex-col items-start gap-0.5">
        <Badge variant="secondary">Sent</Badge>
        <span className="text-xs text-muted-foreground">{when}</span>
      </span>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex cursor-default flex-col items-start gap-0.5">
          <Badge variant={schedule.lastResult === 'failed' ? 'destructive' : 'outline'}>
            {schedule.lastResult === 'failed' ? 'Failed' : 'Missed'}
          </Badge>
          <span className="text-xs text-muted-foreground">{when}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {schedule.lastResult === 'failed'
          ? (schedule.lastError ?? 'Discord rejected the message.')
          : 'The bot was offline when this was due, so it was skipped.'}
      </TooltipContent>
    </Tooltip>
  )
}

function SchedulesPage() {
  const { guildId } = Route.useParams()
  const { data: schedules } = useQuery(queries.schedules(guildId))
  const { data: channels } = useQuery(queries.channels(guildId))
  const update = useUpdateSchedule(guildId)
  const remove = useDeleteSchedule(guildId)
  const sendNow = useSendScheduleNow(guildId)

  const [editing, setEditing] = useState<ScheduleDto | undefined>()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<ScheduleDto | undefined>()

  const openEditor = (schedule?: ScheduleDto) => {
    setEditing(schedule)
    setDialogOpen(true)
  }

  const channelName = (id: string) => channels?.find((c) => c.id === id)?.name

  return (
    <>
      <PageHeader
        title="Scheduled messages"
        description="Messages the bot posts on its own: once, or on a repeating schedule. They never ping anyone."
        actions={
          <Button onClick={() => openEditor()}>
            <PlusIcon data-icon="inline-start" />
            New scheduled message
          </Button>
        }
      />

      {!schedules ? (
        <Skeleton className="h-48" />
      ) : schedules.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarClockIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing scheduled yet</EmptyTitle>
            <EmptyDescription>
              Post event reminders, weekly check-ins or a one-off announcement at
              the time you choose.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => openEditor()}>
              <PlusIcon data-icon="inline-start" />
              New scheduled message
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Message</TableHead>
                <TableHead className="hidden lg:table-cell">Channel</TableHead>
                <TableHead className="hidden sm:table-cell">Next send</TableHead>
                <TableHead className="hidden md:table-cell">Last send</TableHead>
                <TableHead className="w-24">Enabled</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell className="max-w-0 pl-4">
                    <button
                      type="button"
                      className="flex w-full min-w-0 flex-col items-start gap-0.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => openEditor(schedule)}
                    >
                      <span className="w-full truncate font-medium text-white">
                        {schedule.name}
                      </span>
                      <span className="w-full truncate text-sm text-muted-foreground">
                        {describeSchedule(schedule.schedule)}
                      </span>
                    </button>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {channelName(schedule.channelId)
                      ? `#${channelName(schedule.channelId)}`
                      : 'Unknown channel'}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <NextSend schedule={schedule} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <LastResult schedule={schedule} />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={schedule.enabled}
                      aria-label={`Enable ${schedule.name}`}
                      onCheckedChange={(enabled) =>
                        update.mutate(
                          { id: schedule.id, patch: { enabled } },
                          {
                            onSuccess: () =>
                              toast.success(
                                enabled
                                  ? `Turned on "${schedule.name}"`
                                  : `Turned off "${schedule.name}"`,
                              ),
                            onError: (error) => toast.error(errorMessage(error)),
                          },
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${schedule.name}`}
                        >
                          <EllipsisIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem onSelect={() => openEditor(schedule)}>
                            <PencilIcon />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={sendNow.isPending}
                            onSelect={() =>
                              sendNow.mutate(schedule.id, {
                                onSuccess: () => toast.success(`Sent "${schedule.name}"`),
                                onError: (error) => toast.error(errorMessage(error)),
                              })
                            }
                          >
                            <SendIcon />
                            Send now
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setDeleting(schedule)}
                          >
                            <Trash2Icon />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <ScheduleDialog
        guildId={guildId}
        schedule={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={`Delete "${deleting?.name}"?`}
        description="It won't be sent again. Messages already posted stay in Discord. This can't be undone."
        onConfirm={() => {
          if (!deleting) return
          const { id, name } = deleting
          remove.mutate(id, {
            onSuccess: () => toast.success(`Deleted "${name}"`),
            onError: (error) => toast.error(errorMessage(error)),
          })
        }}
      />
    </>
  )
}
