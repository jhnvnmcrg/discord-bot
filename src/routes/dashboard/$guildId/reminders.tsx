import { useForm } from '@tanstack/react-form'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { BellIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDelete } from '#/components/confirm-delete'
import { PageHeader } from '#/components/page-header'
import { fieldErrors } from '#/components/placeholder-picker'
import { TimezoneSelect } from '#/components/timezone-select'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Skeleton } from '#/components/ui/skeleton'
import { Spinner } from '#/components/ui/spinner'
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
  useCancelReminder,
  useSaveReminderSettings,
} from '#/lib/api'
import type { ReminderDto } from '#/lib/api-types'
import { formatRelative } from '#/lib/schedule-format'
import {
  MAX_REMINDERS_PER_MEMBER_LIMIT,
  type ReminderSettingsInput,
  reminderSettingsInput,
} from '#/lib/schemas'

export const Route = createFileRoute('/dashboard/$guildId/reminders')({
  staticData: { title: 'Reminders' },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(queries.reminderSettings(params.guildId)),
  component: RemindersPage,
})

const COMMANDS = [
  { usage: '/remind me when:in 2h what:stretch', note: 'Pings them in the channel' },
  {
    usage: '/remind me when:friday 8pm what:game night private:True',
    note: 'Sends a DM instead',
  },
  { usage: '/remind list', note: 'Their upcoming reminders' },
  { usage: '/remind cancel', note: 'Pick one to cancel' },
  { usage: '/remind timezone zone:Europe/London', note: 'Used for times like "9am"' },
]

const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function SettingsCard({ guildId }: { guildId: string }) {
  const { data: settings } = useSuspenseQuery(queries.reminderSettings(guildId))
  const save = useSaveReminderSettings(guildId)

  const defaultValues: ReminderSettingsInput = {
    enabled: settings.enabled,
    defaultTimezone: settings.defaultTimezone,
    maxPerMember: settings.maxPerMember,
  }
  const form = useForm({
    defaultValues,
    validators: { onChange: reminderSettingsInput },
    onSubmit: async ({ value, formApi }) => {
      try {
        await save.mutateAsync(value)
        formApi.reset(value)
        toast.success('Saved reminder settings')
      } catch (error) {
        toast.error(errorMessage(error))
      }
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>
          Members set reminders for themselves with <code>/remind</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            form.handleSubmit()
          }}
          className="flex flex-col gap-6"
        >
          <FieldGroup>
            <form.Field name="enabled">
              {(field) => (
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor={field.name}>Allow /remind</FieldLabel>
                    <FieldDescription>
                      Turning it off removes the command from this server.
                      Reminders already set are still delivered.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id={field.name}
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="defaultTimezone">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Default time zone</FieldLabel>
                  <TimezoneSelect
                    id={field.name}
                    value={field.state.value}
                    onChange={field.handleChange}
                  />
                  <FieldDescription>
                    Used to read times like "tomorrow 9am" for members who haven't
                    set their own with <code>/remind timezone</code>.
                  </FieldDescription>
                </Field>
              )}
            </form.Field>
            <form.Field name="maxPerMember">
              {(field) => {
                const { invalid, errors } = fieldErrors(field.state.meta)
                return (
                  <Field data-invalid={invalid || undefined}>
                    <FieldLabel htmlFor={field.name}>
                      Upcoming reminders per member
                    </FieldLabel>
                    <Input
                      id={field.name}
                      type="number"
                      min={1}
                      max={MAX_REMINDERS_PER_MEMBER_LIMIT}
                      className="max-w-28"
                      value={Number.isNaN(field.state.value) ? '' : field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                      aria-invalid={invalid || undefined}
                    />
                    <FieldError errors={errors} />
                  </Field>
                )
              }}
            </form.Field>
          </FieldGroup>
          <form.Subscribe
            selector={(state) => [state.isDirty, state.isSubmitting] as const}
          >
            {([isDirty, isSubmitting]) => (
              <div>
                <Button type="submit" disabled={!isDirty || isSubmitting}>
                  {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                  Save settings
                </Button>
              </div>
            )}
          </form.Subscribe>
        </form>

        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">What members can type</span>
          <ul className="flex flex-col gap-3">
            {COMMANDS.map((command) => (
              <li key={command.usage} className="flex flex-col gap-0.5">
                <code className="text-sm break-words text-white">{command.usage}</code>
                <span className="text-xs text-muted-foreground">{command.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

function UpcomingReminders({ guildId }: { guildId: string }) {
  const { data: reminders } = useQuery(queries.reminders(guildId))
  const { data: channels } = useQuery(queries.channels(guildId))
  const cancel = useCancelReminder(guildId)
  const [cancelling, setCancelling] = useState<ReminderDto | undefined>()

  const where = (reminder: ReminderDto) => {
    if (reminder.delivery === 'dm') return 'DM'
    const name = channels?.find((c) => c.id === reminder.channelId)?.name
    return name ? `#${name}` : 'Channel'
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Upcoming reminders</h2>
      {!reminders ? (
        <Skeleton className="h-40" />
      ) : reminders.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BellIcon />
            </EmptyMedia>
            <EmptyTitle>No reminders set</EmptyTitle>
            <EmptyDescription>
              They show up here when members use <code>/remind me</code>.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Member</TableHead>
                <TableHead>Reminder</TableHead>
                <TableHead className="hidden sm:table-cell">Due</TableHead>
                <TableHead className="hidden md:table-cell">Sent to</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Cancel</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reminders.map((reminder) => (
                <TableRow key={reminder.id}>
                  <TableCell className="pl-4 font-medium text-white">
                    {reminder.username}
                  </TableCell>
                  <TableCell className="max-w-0">
                    <span className="block truncate">{reminder.text}</span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default underline decoration-dotted underline-offset-4">
                          {formatRelative(reminder.dueAt)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{dateTime.format(new Date(reminder.dueAt))}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="secondary">{where(reminder)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Cancel ${reminder.username}'s reminder`}
                      onClick={() => setCancelling(reminder)}
                    >
                      <XIcon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <ConfirmDelete
        open={!!cancelling}
        onOpenChange={(open) => !open && setCancelling(undefined)}
        title={`Cancel ${cancelling?.username}'s reminder?`}
        description="It won't be sent, and the member isn't told. This can't be undone."
        confirmLabel="Cancel reminder"
        cancelLabel="Keep it"
        onConfirm={() => {
          if (!cancelling) return
          cancel.mutate(cancelling.id, {
            onSuccess: () => toast.success('Cancelled the reminder'),
            onError: (error) => toast.error(errorMessage(error)),
          })
        }}
      />
    </section>
  )
}

function RemindersPage() {
  const { guildId } = Route.useParams()
  return (
    <>
      <PageHeader
        title="Reminders"
        description="Personal reminders members set for themselves. The bot delivers them in the channel or by DM."
      />
      <SettingsCard guildId={guildId} />
      <UpcomingReminders guildId={guildId} />
    </>
  )
}
