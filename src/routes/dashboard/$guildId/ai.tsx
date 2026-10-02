import { useForm } from '@tanstack/react-form'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { RotateCcwIcon, SendIcon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { DiscordMessage } from '#/components/discord-message'
import { PageHeader } from '#/components/page-header'
import { fieldErrors } from '#/components/placeholder-picker'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardAction,
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
import { Input } from '#/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '#/components/ui/input-group'
import { Spinner } from '#/components/ui/spinner'
import { Switch } from '#/components/ui/switch'
import { Textarea } from '#/components/ui/textarea'
import { errorMessage, queries, useSaveAiChat, useTestAiChat } from '#/lib/api'
import { type AiChatSettingsInput, aiChatSettingsInput } from '#/lib/schemas'

export const Route = createFileRoute('/dashboard/$guildId/ai')({
  staticData: { title: 'AI chat' },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(queries.ai(params.guildId)),
  component: AiChatPage,
})

const PERSONA_LIMIT = 1000

type Turn = { fromBot: boolean; content: string }

function TryIt({ guildId, persona }: { guildId: string; persona: string }) {
  const test = useTestAiChat(guildId)
  const { data: status } = useQuery(queries.status())
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const botName = status?.username ?? 'Your bot'

  const send = async () => {
    const content = draft.trim()
    if (!content || test.isPending) return
    // Like a reply chain in Discord: the last 10 messages are the context.
    const next = [...turns, { fromBot: false, content }].slice(-10)
    setTurns(next)
    setDraft('')
    try {
      const { reply } = await test.mutateAsync({ messages: next, persona })
      setTurns([...next, { fromBot: true, content: reply }])
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Try it</CardTitle>
        <CardDescription>
          Chat with the bot here using the personality above, saved or not.
          Nothing is posted to Discord.
        </CardDescription>
        {turns.length > 0 ? (
          <CardAction>
            <Button variant="ghost" size="sm" onClick={() => setTurns([])}>
              <RotateCcwIcon data-icon="inline-start" />
              Start over
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {turns.length > 0 ? (
          <div className="flex flex-col overflow-hidden rounded-lg bg-message py-2">
            {turns.map((turn, index) => (
              <DiscordMessage
                // biome-ignore lint/suspicious/noArrayIndexKey: turns only grow
                key={index}
                author={turn.fromBot ? botName : 'You'}
                avatarUrl={turn.fromBot ? (status?.avatar ?? undefined) : undefined}
                isBot={turn.fromBot}
                content={turn.content}
                className="rounded-none py-2"
              />
            ))}
            {test.isPending ? (
              <p className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
                <Spinner />
                {botName} is typing…
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ask something a member might, like "what can you help with?"
          </p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          <InputGroup>
            <InputGroupInput
              aria-label="Message the bot"
              placeholder={`Message @${botName}`}
              value={draft}
              maxLength={2000}
              onChange={(e) => setDraft(e.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="submit"
                size="icon-xs"
                aria-label="Send"
                disabled={!draft.trim() || test.isPending}
              >
                <SendIcon />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function AiChatPage() {
  const { guildId } = Route.useParams()
  const { data: settings } = useSuspenseQuery(queries.ai(guildId))
  const { data: status } = useQuery(queries.status())
  const save = useSaveAiChat(guildId)
  const botName = status?.username ?? 'the bot'

  const defaultValues: AiChatSettingsInput = {
    enabled: settings.enabled,
    persona: settings.persona,
    cooldownSeconds: settings.cooldownSeconds,
  }
  const form = useForm({
    defaultValues,
    validators: { onChange: aiChatSettingsInput },
    onSubmit: async ({ value, formApi }) => {
      try {
        await save.mutateAsync(value)
        formApi.reset(value)
        toast.success('Saved AI chat settings')
      } catch (error) {
        toast.error(errorMessage(error))
      }
    },
  })

  return (
    <>
      <PageHeader
        title="AI chat"
        description={`Members talk to ${botName} by @mentioning it or replying to its messages. Answers come from Google Gemini.`}
      />

      {settings.configured ? null : (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Gemini isn't set up</AlertTitle>
          <AlertDescription>
            Add <code>GEMINI_API_KEY</code> to the environment of the bot (so it
            can answer in Discord) and of this dashboard (for Try it).
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>For this server only.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
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
                      <FieldLabel htmlFor={field.name}>
                        Answer when members @mention the bot
                      </FieldLabel>
                      <FieldDescription>
                        When off, mentions are ignored (auto-responders still run).
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

              <form.Field name="persona">
                {(field) => {
                  const { invalid, errors } = fieldErrors(field.state.meta)
                  return (
                    <Field data-invalid={invalid || undefined}>
                      <FieldLabel htmlFor={field.name}>Personality and instructions</FieldLabel>
                      <Textarea
                        id={field.name}
                        rows={6}
                        placeholder="You're the host of our game nights. Be upbeat and brief. For server rules, point people to #rules. Don't give medical or legal advice."
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={invalid || undefined}
                      />
                      <FieldDescription>
                        Optional. Who the bot is and how it should answer here.{' '}
                        <span className="tabular-nums">
                          {field.state.value.length}/{PERSONA_LIMIT}
                        </span>
                      </FieldDescription>
                      <FieldError errors={errors} />
                    </Field>
                  )
                }}
              </form.Field>

              <form.Field name="cooldownSeconds">
                {(field) => {
                  const { invalid, errors } = fieldErrors(field.state.meta)
                  return (
                    <Field data-invalid={invalid || undefined}>
                      <FieldLabel htmlFor={field.name}>Cooldown per member (seconds)</FieldLabel>
                      <Input
                        id={field.name}
                        type="number"
                        min={0}
                        max={600}
                        className="max-w-28"
                        value={Number.isNaN(field.state.value) ? '' : field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                        aria-invalid={invalid || undefined}
                      />
                      <FieldDescription>
                        Mentions during the cooldown get a ⏳ reaction instead of an
                        answer. Keeps costs and spam down.
                      </FieldDescription>
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

          <div className="flex flex-col gap-3 text-sm">
            <span className="font-medium">How members use it</span>
            <ul className="flex flex-col gap-2 text-muted-foreground">
              <li>
                <code className="text-white">@{botName} when is game night?</code>
              </li>
              <li>Reply to its answer to keep going. It reads up to 10 messages back.</li>
              <li>
                Answers ping only the person asking, never <code>@everyone</code> or
                roles.
              </li>
              <li>
                Model: <code>{settings.model}</code>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <form.Subscribe selector={(state) => state.values.persona}>
        {(persona) => <TryIt guildId={guildId} persona={persona} />}
      </form.Subscribe>
    </>
  )
}
