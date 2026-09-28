import { useForm } from '@tanstack/react-form'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { HashIcon, MegaphoneIcon } from 'lucide-react'
import { toast } from 'sonner'

import { DiscordMessage } from '#/components/discord-message'
import { PageHeader } from '#/components/page-header'
import { fieldErrors, PlaceholderPicker } from '#/components/placeholder-picker'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
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
import { errorMessage, queries, useSaveWelcome } from '#/lib/api'
import type { ChannelOption } from '#/lib/api-types'
import { type WelcomeInput, welcomeInput } from '#/lib/schemas'

export const Route = createFileRoute('/dashboard/$guildId/welcome')({
  staticData: { title: 'Welcome' },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(queries.welcome(params.guildId)),
  component: WelcomePage,
})

const NO_ROLE = 'none'

function groupByCategory(channels: ChannelOption[]) {
  const groups = new Map<string, ChannelOption[]>()
  for (const channel of channels) {
    const key = channel.parentName ?? ''
    groups.set(key, [...(groups.get(key) ?? []), channel])
  }
  return [...groups]
}

function WelcomePage() {
  const { guildId } = Route.useParams()
  const { data: welcome } = useSuspenseQuery(queries.welcome(guildId))
  const { data: guild } = useSuspenseQuery(queries.guild(guildId))
  const { data: status } = useQuery(queries.status())
  const channels = useQuery(queries.channels(guildId))
  const roles = useQuery(queries.roles(guildId))
  const save = useSaveWelcome(guildId)

  const defaultValues: WelcomeInput = {
    enabled: welcome.enabled,
    channelId: welcome.channelId,
    message: welcome.message,
    autoRoleId: welcome.autoRoleId,
  }
  const form = useForm({
    defaultValues,
    validators: { onChange: welcomeInput },
    onSubmit: async ({ value, formApi }) => {
      try {
        await save.mutateAsync(value)
        formApi.reset(value)
        toast.success('Saved welcome settings')
      } catch (error) {
        toast.error(errorMessage(error))
      }
    },
  })

  const discordError = channels.error ?? roles.error

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
      className="flex flex-col gap-6"
    >
      <PageHeader
        title="Welcome"
        description="Greet new members and give them a role when they join."
        actions={
          <form.Subscribe
            selector={(state) => [state.isDirty, state.isSubmitting] as const}
          >
            {([isDirty, isSubmitting]) => (
              <Button type="submit" disabled={!isDirty || isSubmitting}>
                {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                Save changes
              </Button>
            )}
          </form.Subscribe>
        }
      />

      {discordError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Couldn't load this server's channels and roles from Discord:{' '}
            {errorMessage(discordError)}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Welcome message</CardTitle>
          <CardDescription>Posted when someone joins the server.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <FieldGroup>
            <form.Field name="enabled">
              {(field) => (
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor={field.name}>Send a welcome message</FieldLabel>
                  </FieldContent>
                  <Switch
                    id={field.name}
                    checked={field.state.value}
                    onCheckedChange={(checked) => {
                      field.handleChange(checked)
                      // Re-check the channel requirement when this flips.
                      form.validateField('channelId', 'change')
                    }}
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="channelId">
              {(field) => {
                const { invalid, errors } = fieldErrors(field.state.meta)
                // A saved channel can be deleted in Discord after the fact.
                const missing =
                  !!field.state.value &&
                  !!channels.data &&
                  !channels.data.some((c) => c.id === field.state.value)
                return (
                  <Field data-invalid={invalid || missing || undefined}>
                    <FieldLabel htmlFor={field.name}>Channel</FieldLabel>
                    <Select
                      // '' shows the placeholder; Radix reports '' when the
                      // value has no matching item, which must not clear the field.
                      value={missing ? '' : (field.state.value ?? '')}
                      onValueChange={(value) => {
                        if (!value) return
                        field.handleChange(value)
                        field.handleBlur()
                      }}
                      disabled={!channels.data}
                    >
                      <SelectTrigger
                        id={field.name}
                        className="w-full max-w-sm"
                        aria-invalid={invalid || missing || undefined}
                      >
                        <SelectValue
                          placeholder={channels.isPending ? 'Loading channels…' : 'Pick a channel'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {groupByCategory(channels.data ?? []).map(([category, items]) => (
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
                    <FieldDescription>
                      {missing
                        ? 'The saved channel no longer exists. Pick another one.'
                        : 'The bot needs permission to send messages there.'}
                    </FieldDescription>
                    <FieldError errors={errors} />
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="message">
              {(field) => {
                const { invalid, errors } = fieldErrors(field.state.meta)
                return (
                  <Field data-invalid={invalid || undefined}>
                    <FieldLabel htmlFor={field.name}>Message</FieldLabel>
                    <Textarea
                      id={field.name}
                      name={field.name}
                      rows={4}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={invalid || undefined}
                    />
                    <PlaceholderPicker
                      keys={['user', 'user.name', 'server', 'memberCount']}
                      onInsert={(token) => field.handleChange(field.state.value + token)}
                    />
                    <FieldError errors={errors} />
                  </Field>
                )
              }}
            </form.Field>
          </FieldGroup>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Preview</span>
            <form.Subscribe selector={(state) => state.values.message}>
              {(message) => (
                <DiscordMessage
                  author={status?.username ?? 'Your bot'}
                  avatarUrl={status?.avatar ?? undefined}
                  content={message}
                  vars={{
                    user: '@alex',
                    'user.name': 'alex',
                    server: guild.name,
                    memberCount: String(guild.memberCount + 1),
                  }}
                />
              )}
            </form.Subscribe>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auto-role</CardTitle>
          <CardDescription>
            Given to every new member. Members who still have to pass membership
            screening get it once they do.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form.Field name="autoRoleId">
            {(field) => {
              const missing =
                !!field.state.value &&
                !!roles.data &&
                !roles.data.some((r) => r.id === field.state.value)
              return (
              <Field data-invalid={missing || undefined}>
                <FieldLabel htmlFor={field.name}>Role</FieldLabel>
                <Select
                  value={missing ? '' : (field.state.value ?? NO_ROLE)}
                  onValueChange={(value) => {
                    if (!value) return
                    field.handleChange(value === NO_ROLE ? null : value)
                  }}
                  disabled={!roles.data}
                >
                  <SelectTrigger
                    id={field.name}
                    className="w-full max-w-sm"
                    aria-invalid={missing || undefined}
                  >
                    <SelectValue
                      placeholder={roles.isPending ? 'Loading roles…' : 'Pick a role'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={NO_ROLE}>No auto-role</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Roles</SelectLabel>
                      {roles.data?.map((role) => (
                        <SelectItem
                          key={role.id}
                          value={role.id}
                          disabled={!role.assignable}
                        >
                          <span
                            aria-hidden
                            className="size-2.5 rounded-full"
                            style={{
                              backgroundColor: role.color
                                ? `#${role.color.toString(16).padStart(6, '0')}`
                                : 'var(--muted-foreground)',
                            }}
                          />
                          {role.name}
                          {role.assignable ? null : (
                            <span className="text-xs text-muted-foreground">
                              above the bot's role
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {missing
                    ? 'The saved role no longer exists. Pick another one or choose no auto-role.'
                    : "Roles above the bot's own role can't be given. Move the bot's role higher in Server Settings to unlock them."}
                </FieldDescription>
              </Field>
              )
            }}
          </form.Field>
        </CardContent>
      </Card>
    </form>
  )
}
