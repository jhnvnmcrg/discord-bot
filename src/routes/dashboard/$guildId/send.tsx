import { useForm } from '@tanstack/react-form'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ExternalLinkIcon, SendIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ChannelSelect } from '#/components/channel-select'
import { DiscordMessage } from '#/components/discord-message'
import { MemberPicker } from '#/components/member-picker'
import { PageHeader } from '#/components/page-header'
import { fieldErrors, PlaceholderPicker } from '#/components/placeholder-picker'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
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
import { Textarea } from '#/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { errorMessage, queries, useSendMessage } from '#/lib/api'
import type { MemberOption } from '#/lib/api-types'
import { formatRelative } from '#/lib/schedule-format'
import { type SendMessageInput, sendMessageInput } from '#/lib/schemas'
import type { PlaceholderKey } from '#/lib/templates'

export const Route = createFileRoute('/dashboard/$guildId/send')({
  staticData: { title: 'Send a message' },
  component: SendPage,
})

type FormValues = {
  targetType: 'channel' | 'dm'
  channelId: string
  userId: string
  responseType: 'text' | 'embed'
  content: string
  embed: { title: string; description: string; color: string }
}

const EMPTY: FormValues = {
  targetType: 'channel',
  channelId: '',
  userId: '',
  responseType: 'text',
  content: '',
  embed: { title: '', description: '', color: '#5865f2' },
}

const PLACEHOLDER_KEYS: Record<FormValues['targetType'], PlaceholderKey[]> = {
  channel: ['server', 'memberCount', 'channel'],
  dm: ['user', 'user.name', 'server', 'memberCount'],
}

function toInput(values: FormValues): SendMessageInput {
  return {
    target:
      values.targetType === 'channel'
        ? { type: 'channel', channelId: values.channelId }
        : { type: 'dm', userId: values.userId },
    responseType: values.responseType,
    content: values.content,
    embed: values.embed,
  }
}

function Composer({ guildId }: { guildId: string }) {
  const send = useSendMessage(guildId)
  const channels = useQuery(queries.channels(guildId))
  const { data: guild } = useQuery(queries.guild(guildId))
  const { data: status } = useQuery(queries.status())
  const [member, setMember] = useState<MemberOption | undefined>()

  const channelName = (id: string) => channels.data?.find((c) => c.id === id)?.name

  const form = useForm({
    defaultValues: EMPTY,
    validators: {
      onChange: ({ value }) => {
        const result = sendMessageInput.safeParse(toInput(value))
        if (result.success) return undefined
        const fields: Record<string, string> = {}
        for (const issue of result.error.issues) {
          const key = issue.path[0] === 'target' ? String(issue.path[1]) : issue.path.join('.')
          fields[key] ??= issue.message
        }
        return { fields }
      },
    },
    onSubmit: async ({ value, formApi }) => {
      const to =
        value.targetType === 'channel'
          ? `#${channelName(value.channelId) ?? 'channel'}`
          : (member?.displayName ?? 'the member')
      try {
        const sent = await send.mutateAsync(toInput(value))
        toast.success(`Sent to ${to}`, {
          action: sent.url
            ? { label: 'Open in Discord', onClick: () => window.open(sent.url ?? '', '_blank') }
            : undefined,
        })
        // Keep the target, clear the message.
        formApi.reset({
          ...value,
          content: '',
          embed: { ...value.embed, title: '', description: '' },
        })
      } catch (error) {
        toast.error(errorMessage(error))
      }
    },
  })

  return (
    <Card>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            form.handleSubmit()
          }}
          className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]"
        >
          <FieldGroup>
            <form.Field name="targetType">
              {(field) => (
                <Field>
                  <FieldLabel>Send to</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={field.state.value}
                    onValueChange={(value) => {
                      if (value) field.handleChange(value as FormValues['targetType'])
                    }}
                  >
                    <ToggleGroupItem value="channel">A channel</ToggleGroupItem>
                    <ToggleGroupItem value="dm">A member's DMs</ToggleGroupItem>
                  </ToggleGroup>
                </Field>
              )}
            </form.Field>

            <form.Subscribe selector={(state) => state.values.targetType}>
              {(targetType) =>
                targetType === 'channel' ? (
                  <form.Field name="channelId">
                    {(field) => {
                      const { invalid, errors } = fieldErrors(field.state.meta)
                      return (
                        <Field data-invalid={invalid || undefined}>
                          <FieldLabel htmlFor="send-channel">Channel</FieldLabel>
                          <ChannelSelect
                            id="send-channel"
                            channels={channels.data}
                            value={field.state.value}
                            onChange={(value) => {
                              field.handleChange(value)
                              field.handleBlur()
                            }}
                            invalid={invalid}
                          />
                          <FieldError errors={errors} />
                        </Field>
                      )
                    }}
                  </form.Field>
                ) : (
                  <form.Field name="userId">
                    {(field) => {
                      const { invalid, errors } = fieldErrors(field.state.meta)
                      return (
                        <Field data-invalid={invalid || undefined}>
                          <FieldLabel htmlFor="send-member">Member</FieldLabel>
                          <MemberPicker
                            id="send-member"
                            guildId={guildId}
                            value={member}
                            onChange={(next) => {
                              setMember(next)
                              field.handleChange(next?.id ?? '')
                              field.handleBlur()
                            }}
                            invalid={invalid}
                          />
                          <FieldDescription>
                            The DM fails if they've turned off messages from server
                            members.
                          </FieldDescription>
                          <FieldError errors={errors} />
                        </Field>
                      )
                    }}
                  </form.Field>
                )
              }
            </form.Subscribe>

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

            <form.Subscribe
              selector={(state) => [state.values.responseType, state.values.targetType] as const}
            >
              {([responseType, targetType]) =>
                responseType === 'text' ? (
                  <form.Field name="content">
                    {(field) => {
                      const { invalid, errors } = fieldErrors(field.state.meta)
                      return (
                        <Field data-invalid={invalid || undefined}>
                          <FieldLabel htmlFor="send-content">Message</FieldLabel>
                          <Textarea
                            id="send-content"
                            rows={5}
                            placeholder="Server maintenance tonight at 10pm. Expect a few minutes of downtime."
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            aria-invalid={invalid || undefined}
                          />
                          <PlaceholderPicker
                            keys={PLACEHOLDER_KEYS[targetType]}
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
                            <FieldLabel htmlFor="send-embed-title">Embed title</FieldLabel>
                            <Input
                              id="send-embed-title"
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
                          <FieldLabel htmlFor="send-embed-text">Embed text</FieldLabel>
                          <Textarea
                            id="send-embed-text"
                            rows={5}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                          />
                          <PlaceholderPicker
                            keys={PLACEHOLDER_KEYS[targetType]}
                            onInsert={(token) => field.handleChange(field.state.value + token)}
                          />
                        </Field>
                      )}
                    </form.Field>
                    <form.Field name="embed.color">
                      {(field) => (
                        <Field orientation="horizontal">
                          <Input
                            id="send-embed-color"
                            type="color"
                            className="h-9 w-12 cursor-pointer p-1"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                          />
                          <FieldLabel htmlFor="send-embed-color">
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

            <form.Subscribe
              selector={(state) =>
                [state.isSubmitting, state.values.targetType, state.values.channelId] as const
              }
            >
              {([isSubmitting, targetType, channelId]) => {
                const to =
                  targetType === 'channel'
                    ? channelName(channelId) && `#${channelName(channelId)}`
                    : member?.displayName
                return (
                  <div>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <SendIcon data-icon="inline-start" />
                      )}
                      {to ? `Send to ${to}` : 'Send message'}
                    </Button>
                  </div>
                )
              }}
            </form.Subscribe>
          </FieldGroup>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Preview</span>
            <form.Subscribe selector={(state) => state.values}>
              {(values) => (
                <DiscordMessage
                  author={status?.username ?? 'Your bot'}
                  avatarUrl={status?.avatar ?? undefined}
                  content={values.responseType === 'text' ? values.content || 'Your message appears here.' : undefined}
                  embed={values.responseType === 'embed' ? values.embed : undefined}
                  vars={{
                    user: `@${member?.displayName ?? 'alex'}`,
                    'user.name': member?.displayName ?? 'alex',
                    server: guild?.name ?? 'your server',
                    memberCount: guild ? String(guild.memberCount) : '128',
                    channel: channelName(values.channelId)
                      ? `#${channelName(values.channelId)}`
                      : '#channel',
                  }}
                />
              )}
            </form.Subscribe>
            <p className="text-xs text-muted-foreground">
              Sent as the bot. Mentions like @everyone show as text and don't ping
              anyone.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function RecentSends({ guildId }: { guildId: string }) {
  const activity = useInfiniteQuery(queries.activity(guildId, 'message'))
  const { data: channels } = useQuery(queries.channels(guildId))
  const recent = activity.data?.pages[0]?.items.slice(0, 10)

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Sent from the dashboard</h2>
      {!recent ? (
        <Skeleton className="h-32" />
      ) : recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing yet. Messages you send here are listed with a link back to Discord.
        </p>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">When</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((entry) => {
                const meta = entry.metadata ?? {}
                const channel = channels?.find((c) => c.id === entry.channelId)?.name
                const to =
                  meta.target === 'dm'
                    ? `DM to @${String(meta.username ?? 'member')}`
                    : `#${channel ?? 'channel'}`
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="pl-4 text-muted-foreground">
                      {formatRelative(entry.createdAt)}
                    </TableCell>
                    <TableCell>{to}</TableCell>
                    <TableCell className="max-w-0">
                      <span className="block truncate">{entry.name}</span>
                    </TableCell>
                    <TableCell>
                      {typeof meta.url === 'string' ? (
                        <Button variant="ghost" size="icon" asChild>
                          <a href={meta.url} target="_blank" rel="noreferrer" aria-label="Open in Discord">
                            <ExternalLinkIcon />
                          </a>
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </section>
  )
}

function SendPage() {
  const { guildId } = Route.useParams()
  const { data: status } = useQuery(queries.status())
  return (
    <>
      <PageHeader
        title="Send a message"
        description={`Post as ${status?.username ?? 'the bot'} in a channel, or DM a member. It goes out immediately.`}
      />
      <Composer guildId={guildId} />
      <RecentSends guildId={guildId} />
    </>
  )
}
