import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { HashIcon, MegaphoneIcon } from 'lucide-react'
import { toast } from 'sonner'

import { DiscordMessage } from '#/components/discord-message'
import { fieldErrors, PlaceholderPicker } from '#/components/placeholder-picker'
import { TimezoneSelect } from '#/components/timezone-select'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Spinner } from '#/components/ui/spinner'
import { Switch } from '#/components/ui/switch'
import { Textarea } from '#/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { errorMessage, queries, useSaveSchedule } from '#/lib/api'
import type { ChannelOption, ScheduleDto } from '#/lib/api-types'
import {
  computeNextRun,
  nextRuns,
  type Schedule,
  type ScheduleType,
} from '#/lib/schedule'
import {
  browserTimezone,
  describeCron,
  formatInZone,
  WEEKDAYS,
} from '#/lib/schedule-format'
import {
  type ScheduledMessageInput,
  scheduledMessageInput,
  scheduleSchema,
} from '#/lib/schemas'

const BLURPLE = '#5865f2'

const REPEAT_OPTIONS: { value: ScheduleType; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'cron', label: 'Custom' },
]

const MONTH_DAYS = [
  ...Array.from({ length: 28 }, (_, i) => String(i + 1)),
  'last',
]

// The form keeps every schedule kind's fields at once (so switching kinds
// doesn't lose input) and converts to the API's tagged union on submit.
type FormValues = Omit<ScheduledMessageInput, 'schedule' | 'embed'> & {
  type: ScheduleType
  at: string
  time: string
  days: string[]
  day: string
  expression: string
  embed: NonNullable<ScheduledMessageInput['embed']>
}

function toSchedule(values: FormValues): Schedule {
  switch (values.type) {
    case 'once':
      return { type: 'once', at: values.at }
    case 'daily':
      return { type: 'daily', time: values.time }
    case 'weekly':
      return { type: 'weekly', time: values.time, days: values.days.map(Number) }
    case 'monthly':
      return {
        type: 'monthly',
        time: values.time,
        day: values.day === 'last' ? 'last' : Number(values.day),
      }
    case 'cron':
      return { type: 'cron', expression: values.expression }
  }
}

function toInput(values: FormValues): ScheduledMessageInput {
  const { type, at, time, days, day, expression, ...rest } = values
  return { ...rest, schedule: toSchedule(values) }
}

/** An hour from now, on the hour, as a datetime-local value. */
function defaultAt() {
  const d = new Date(Date.now() + 60 * 60_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`
}

function toFormValues(schedule?: ScheduleDto): FormValues {
  const s = schedule?.schedule
  return {
    name: schedule?.name ?? '',
    channelId: schedule?.channelId ?? '',
    type: s?.type ?? 'weekly',
    at: s?.type === 'once' ? s.at : defaultAt(),
    time: s && 'time' in s ? s.time : '09:00',
    days: s?.type === 'weekly' ? s.days.map(String) : ['1'],
    day: s?.type === 'monthly' ? String(s.day) : '1',
    expression: s?.type === 'cron' ? s.expression : '0 9 * * 1',
    timezone: schedule?.timezone ?? browserTimezone(),
    responseType: schedule?.responseType ?? 'text',
    content: schedule?.content ?? '',
    embed: {
      title: schedule?.embed?.title ?? '',
      description: schedule?.embed?.description ?? '',
      color: schedule?.embed?.color ?? BLURPLE,
    },
    enabled: schedule?.enabled ?? true,
  }
}

/** Maps an API issue path onto the flat form's field names. */
function formFieldFor(path: PropertyKey[]) {
  return path[0] === 'schedule' ? String(path[1] ?? 'type') : path.join('.')
}

function ChannelSelect({
  channels,
  value,
  onChange,
  invalid,
}: {
  channels?: ChannelOption[]
  value: string
  onChange: (value: string) => void
  invalid: boolean
}) {
  const groups = new Map<string, ChannelOption[]>()
  for (const channel of channels ?? []) {
    const key = channel.parentName ?? ''
    groups.set(key, [...(groups.get(key) ?? []), channel])
  }
  return (
    <Select
      value={value}
      onValueChange={(next) => next && onChange(next)}
      disabled={!channels}
    >
      <SelectTrigger id="channelId" className="w-full" aria-invalid={invalid || undefined}>
        <SelectValue placeholder={channels ? 'Pick a channel' : 'Loading channels…'} />
      </SelectTrigger>
      <SelectContent>
        {[...groups].map(([category, items]) => (
          <SelectGroup key={category || 'none'}>
            {category ? <SelectLabel>{category}</SelectLabel> : null}
            {items.map((channel) => (
              <SelectItem key={channel.id} value={channel.id}>
                {channel.type === 5 ? <MegaphoneIcon /> : <HashIcon />}
                {channel.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

function ScheduleForm({
  guildId,
  schedule,
  onDone,
}: {
  guildId: string
  schedule?: ScheduleDto
  onDone: () => void
}) {
  const save = useSaveSchedule(guildId)
  const { data: status } = useQuery(queries.status())
  const { data: guild } = useQuery(queries.guild(guildId))
  const channels = useQuery(queries.channels(guildId))
  const original = schedule ? JSON.stringify([schedule.schedule, schedule.timezone]) : null

  const form = useForm({
    defaultValues: toFormValues(schedule),
    validators: {
      onChange: ({ value }) => {
        const input = toInput(value)
        const result = scheduledMessageInput.safeParse(input)
        const fields: Record<string, string> = {}
        if (!result.success) {
          for (const issue of result.error.issues) {
            fields[formFieldFor(issue.path)] ??= issue.message
          }
        } else if (
          input.schedule.type === 'once' &&
          original !== JSON.stringify([input.schedule, input.timezone]) &&
          computeNextRun(input.schedule, input.timezone) === null
        ) {
          fields.at = 'Pick a time in the future'
        }
        return Object.keys(fields).length > 0 ? { fields } : undefined
      },
    },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync({ id: schedule?.id, input: toInput(value) })
        toast.success(schedule ? `Saved "${value.name}"` : `Scheduled "${value.name}"`)
        onDone()
      } catch (error) {
        toast.error(errorMessage(error))
      }
    },
  })

  const timeField = (
    <form.Field name="time">
      {(field) => {
        const { invalid, errors } = fieldErrors(field.state.meta)
        return (
          <Field data-invalid={invalid || undefined}>
            <FieldLabel htmlFor={field.name}>Time</FieldLabel>
            <Input
              id={field.name}
              type="time"
              className="max-w-36"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              aria-invalid={invalid || undefined}
            />
            <FieldError errors={errors} />
          </Field>
        )
      }}
    </form.Field>
  )

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
      className="flex min-h-0 flex-col gap-6"
    >
      <div className="grid min-h-0 gap-6 overflow-y-auto md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <FieldGroup>
          <form.Field name="name">
            {(field) => {
              const { invalid, errors } = fieldErrors(field.state.meta)
              return (
                <Field data-invalid={invalid || undefined}>
                  <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                  <Input
                    id={field.name}
                    placeholder="Weekly game night reminder"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={invalid || undefined}
                  />
                  <FieldDescription>Only shown here, not in Discord.</FieldDescription>
                  <FieldError errors={errors} />
                </Field>
              )
            }}
          </form.Field>

          <form.Field name="channelId">
            {(field) => {
              const { invalid, errors } = fieldErrors(field.state.meta)
              return (
                <Field data-invalid={invalid || undefined}>
                  <FieldLabel htmlFor="channelId">Channel</FieldLabel>
                  <ChannelSelect
                    channels={channels.data}
                    value={field.state.value}
                    onChange={(value) => {
                      field.handleChange(value)
                      field.handleBlur()
                    }}
                    invalid={invalid}
                  />
                  {channels.error ? (
                    <FieldDescription>
                      Couldn't load channels: {errorMessage(channels.error)}
                    </FieldDescription>
                  ) : null}
                  <FieldError errors={errors} />
                </Field>
              )
            }}
          </form.Field>

          <form.Field name="type">
            {(field) => (
              <Field>
                <FieldLabel>Repeats</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  className="flex-wrap"
                  value={field.state.value}
                  onValueChange={(value) => {
                    if (value) field.handleChange(value as ScheduleType)
                  }}
                >
                  {REPEAT_OPTIONS.map((option) => (
                    <ToggleGroupItem key={option.value} value={option.value}>
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.values.type}>
            {(type) => (
              <>
                {type === 'once' ? (
                  <form.Field name="at">
                    {(field) => {
                      const { invalid, errors } = fieldErrors(field.state.meta)
                      return (
                        <Field data-invalid={invalid || undefined}>
                          <FieldLabel htmlFor={field.name}>Date and time</FieldLabel>
                          <Input
                            id={field.name}
                            type="datetime-local"
                            className="max-w-60"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            aria-invalid={invalid || undefined}
                          />
                          <FieldError errors={errors} />
                        </Field>
                      )
                    }}
                  </form.Field>
                ) : null}

                {type === 'daily' ? timeField : null}

                {type === 'weekly' ? (
                  <>
                    <form.Field name="days">
                      {(field) => {
                        const { invalid, errors } = fieldErrors(field.state.meta)
                        return (
                          <Field data-invalid={invalid || undefined}>
                            <FieldLabel>On</FieldLabel>
                            <ToggleGroup
                              type="multiple"
                              variant="outline"
                              className="flex-wrap"
                              value={field.state.value}
                              onValueChange={(value) => {
                                field.handleChange(value)
                                field.handleBlur()
                              }}
                            >
                              {WEEKDAYS.map((day) => (
                                <ToggleGroupItem
                                  key={day.value}
                                  value={String(day.value)}
                                  aria-label={day.long}
                                >
                                  {day.short}
                                </ToggleGroupItem>
                              ))}
                            </ToggleGroup>
                            <FieldError errors={errors} />
                          </Field>
                        )
                      }}
                    </form.Field>
                    {timeField}
                  </>
                ) : null}

                {type === 'monthly' ? (
                  <>
                    <form.Field name="day">
                      {(field) => (
                        <Field>
                          <FieldLabel htmlFor={field.name}>Day of the month</FieldLabel>
                          <Select
                            value={field.state.value}
                            onValueChange={(value) => value && field.handleChange(value)}
                          >
                            <SelectTrigger id={field.name} className="max-w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {MONTH_DAYS.map((day) => (
                                  <SelectItem key={day} value={day}>
                                    {day === 'last' ? 'Last day' : day}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          <FieldDescription>
                            Days after the 28th vary by month, so use "Last day"
                            for the end of the month.
                          </FieldDescription>
                        </Field>
                      )}
                    </form.Field>
                    {timeField}
                  </>
                ) : null}

                {type === 'cron' ? (
                  <form.Field name="expression">
                    {(field) => {
                      const { invalid, errors } = fieldErrors(field.state.meta)
                      const described = describeCron(field.state.value)
                      return (
                        <Field data-invalid={invalid || undefined}>
                          <FieldLabel htmlFor={field.name}>Cron expression</FieldLabel>
                          <Input
                            id={field.name}
                            className="font-mono"
                            placeholder="0 9 * * 1"
                            autoComplete="off"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            aria-invalid={invalid || undefined}
                          />
                          <FieldDescription>
                            {described && !invalid
                              ? described
                              : 'Minute, hour, day of month, month, day of week. At least 5 minutes apart.'}
                          </FieldDescription>
                          <FieldError errors={errors} />
                        </Field>
                      )
                    }}
                  </form.Field>
                ) : null}
              </>
            )}
          </form.Subscribe>

          <form.Field name="timezone">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Time zone</FieldLabel>
                <TimezoneSelect
                  id={field.name}
                  value={field.state.value}
                  onChange={field.handleChange}
                />
                <FieldDescription>
                  Times follow this zone, including daylight saving changes.
                </FieldDescription>
              </Field>
            )}
          </form.Field>

          <form.Field name="responseType">
            {(field) => (
              <Field>
                <FieldLabel>Send</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={field.state.value}
                  onValueChange={(value) => {
                    if (value) field.handleChange(value as 'text' | 'embed')
                  }}
                >
                  <ToggleGroupItem value="text">A message</ToggleGroupItem>
                  <ToggleGroupItem value="embed">An embed</ToggleGroupItem>
                </ToggleGroup>
              </Field>
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.values.responseType}>
            {(responseType) =>
              responseType === 'text' ? (
                <form.Field name="content">
                  {(field) => {
                    const { invalid, errors } = fieldErrors(field.state.meta)
                    return (
                      <Field data-invalid={invalid || undefined}>
                        <FieldLabel htmlFor={field.name}>Message</FieldLabel>
                        <Textarea
                          id={field.name}
                          rows={4}
                          placeholder="Game night starts in an hour in {channel}!"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={invalid || undefined}
                        />
                        <PlaceholderPicker
                          keys={['server', 'memberCount', 'channel']}
                          onInsert={(token) => field.handleChange(field.state.value + token)}
                        />
                        <FieldError errors={errors} />
                      </Field>
                    )
                  }}
                </form.Field>
              ) : (
                <>
                  <form.Field name="embed.title">
                    {(field) => {
                      const { invalid, errors } = fieldErrors(field.state.meta)
                      return (
                        <Field data-invalid={invalid || undefined}>
                          <FieldLabel htmlFor={field.name}>Embed title</FieldLabel>
                          <Input
                            id={field.name}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            aria-invalid={invalid || undefined}
                          />
                          <FieldError errors={errors} />
                        </Field>
                      )
                    }}
                  </form.Field>
                  <form.Field name="embed.description">
                    {(field) => (
                      <Field>
                        <FieldLabel htmlFor={field.name}>Embed text</FieldLabel>
                        <Textarea
                          id={field.name}
                          rows={4}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                        <PlaceholderPicker
                          keys={['server', 'memberCount', 'channel']}
                          onInsert={(token) => field.handleChange(field.state.value + token)}
                        />
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name="embed.color">
                    {(field) => (
                      <Field orientation="horizontal">
                        <Input
                          id={field.name}
                          type="color"
                          className="h-9 w-12 cursor-pointer p-1"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                        <FieldLabel htmlFor={field.name}>
                          Accent colour
                          <code className="text-xs text-muted-foreground">
                            {field.state.value}
                          </code>
                        </FieldLabel>
                      </Field>
                    )}
                  </form.Field>
                </>
              )
            }
          </form.Subscribe>

          <form.Field name="enabled">
            {(field) => (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor={field.name}>Enabled</FieldLabel>
                  <FieldDescription>
                    Nothing is sent while it's off. Turning it back on picks up
                    from the next scheduled time.
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
        </FieldGroup>

        <div className="flex flex-col gap-4 md:sticky md:top-0 md:self-start">
          <form.Subscribe selector={(state) => state.values}>
            {(values) => {
              const schedule = toSchedule(values)
              // Only preview schedules the API would accept (e.g. not a too-frequent cron).
              const upcoming = scheduleSchema.safeParse(schedule).success
                ? nextRuns(schedule, values.timezone, 3)
                : []
              const channelName = channels.data?.find((c) => c.id === values.channelId)?.name
              return (
                <>
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">Next sends</span>
                    {upcoming.length > 0 ? (
                      <ol className="flex flex-col gap-1 text-sm tabular-nums">
                        {upcoming.map((date) => (
                          <li key={date.toISOString()}>{formatInZone(date, values.timezone)}</li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Finish the schedule to see when it sends.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">Preview</span>
                    <DiscordMessage
                      author={status?.username ?? 'Your bot'}
                      avatarUrl={status?.avatar ?? undefined}
                      content={values.responseType === 'text' ? values.content : undefined}
                      embed={values.responseType === 'embed' ? values.embed : undefined}
                      vars={{
                        server: guild?.name ?? 'your server',
                        memberCount: guild ? String(guild.memberCount) : '128',
                        channel: channelName ? `#${channelName}` : '#channel',
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Scheduled messages never ping anyone.
                    </p>
                  </div>
                </>
              )
            }}
          </form.Subscribe>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
              {schedule ? 'Save changes' : 'Schedule message'}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}

export function ScheduleDialog({
  guildId,
  schedule,
  open,
  onOpenChange,
}: {
  guildId: string
  schedule?: ScheduleDto
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {schedule ? `Edit "${schedule.name}"` : 'New scheduled message'}
          </DialogTitle>
          <DialogDescription>
            The bot posts it at the times below. It checks for due messages
            every 15 seconds.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ScheduleForm
            key={schedule?.id ?? 'new'}
            guildId={guildId}
            schedule={schedule}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
