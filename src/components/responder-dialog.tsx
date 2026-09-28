import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { CheckIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { DiscordMessage } from '#/components/discord-message'
import { fieldErrors, PlaceholderPicker } from '#/components/placeholder-picker'
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '#/components/ui/input-group'
import { Spinner } from '#/components/ui/spinner'
import { Switch } from '#/components/ui/switch'
import { Textarea } from '#/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { errorMessage, queries, useSaveResponder } from '#/lib/api'
import type { ResponderDto } from '#/lib/api-types'
import { compileMatcher } from '#/lib/matching'
import { MATCH_TYPES, type ResponderInput, responderInput } from '#/lib/schemas'

export const MATCH_LABELS: Record<(typeof MATCH_TYPES)[number], string> = {
  contains: 'Contains',
  exact: 'Is exactly',
  startsWith: 'Starts with',
  regex: 'Regex',
}

function toFormValues(responder?: ResponderDto): ResponderInput {
  return {
    trigger: responder?.trigger ?? '',
    matchType: responder?.matchType ?? 'contains',
    caseSensitive: responder?.caseSensitive ?? false,
    response: responder?.response ?? '',
    cooldownSeconds: responder?.cooldownSeconds ?? 10,
    enabled: responder?.enabled ?? true,
  }
}

function MatchTester({ rule }: { rule: Parameters<typeof compileMatcher>[0] }) {
  const [sample, setSample] = useState('')
  const matcher = compileMatcher(rule)
  const matched = sample.trim() !== '' && matcher?.(sample)

  return (
    <Field>
      <FieldLabel htmlFor="match-tester">Try a message</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id="match-tester"
          placeholder="Type what someone might say"
          value={sample}
          onChange={(e) => setSample(e.target.value)}
        />
        {sample.trim() ? (
          <InputGroupAddon align="inline-end">
            <InputGroupText className={matched ? 'text-success' : undefined}>
              {matched ? <CheckIcon /> : <XIcon />}
              {matched ? 'Replies' : 'No reply'}
            </InputGroupText>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </Field>
  )
}

function ResponderForm({
  guildId,
  responder,
  onDone,
}: {
  guildId: string
  responder?: ResponderDto
  onDone: () => void
}) {
  const save = useSaveResponder(guildId)
  const { data: status } = useQuery(queries.status())

  const form = useForm({
    defaultValues: toFormValues(responder),
    validators: { onChange: responderInput },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync({ id: responder?.id, input: value })
        toast.success(responder ? 'Saved auto-responder' : 'Created auto-responder')
        onDone()
      } catch (error) {
        toast.error(errorMessage(error))
      }
    },
  })

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
          <form.Field name="matchType">
            {(field) => (
              <Field>
                <FieldLabel>When a message</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  className="flex-wrap"
                  value={field.state.value}
                  onValueChange={(value) => {
                    if (value) field.handleChange(value as ResponderInput['matchType'])
                  }}
                >
                  {MATCH_TYPES.map((type) => (
                    <ToggleGroupItem key={type} value={type}>
                      {MATCH_LABELS[type]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
            )}
          </form.Field>

          <form.Field name="trigger">
            {(field) => {
              const { invalid, errors } = fieldErrors(field.state.meta)
              return (
                <Field data-invalid={invalid || undefined}>
                  <FieldLabel htmlFor={field.name}>Trigger</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    className="font-mono"
                    placeholder="good morning"
                    autoComplete="off"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={invalid || undefined}
                  />
                  <form.Subscribe selector={(state) => state.values.matchType}>
                    {(matchType) =>
                      matchType === 'regex' ? (
                        <FieldDescription>
                          JavaScript regular expression, without slashes. For
                          example <code>^(hi|hello)\b</code>
                        </FieldDescription>
                      ) : null
                    }
                  </form.Subscribe>
                  <FieldError errors={errors} />
                </Field>
              )
            }}
          </form.Field>

          <form.Field name="caseSensitive">
            {(field) => (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor={field.name}>Match capital letters exactly</FieldLabel>
                  <FieldDescription>Off means "Hello" also matches "hello".</FieldDescription>
                </FieldContent>
                <Switch
                  id={field.name}
                  checked={field.state.value}
                  onCheckedChange={field.handleChange}
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="response">
            {(field) => {
              const { invalid, errors } = fieldErrors(field.state.meta)
              return (
                <Field data-invalid={invalid || undefined}>
                  <FieldLabel htmlFor={field.name}>Reply</FieldLabel>
                  <Textarea
                    id={field.name}
                    name={field.name}
                    rows={3}
                    placeholder="Morning, {user}!"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={invalid || undefined}
                  />
                  <PlaceholderPicker
                    onInsert={(token) => field.handleChange(field.state.value + token)}
                  />
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
                  <FieldLabel htmlFor={field.name}>Cooldown</FieldLabel>
                  <InputGroup className="max-w-40">
                    <InputGroupInput
                      id={field.name}
                      name={field.name}
                      type="number"
                      min={0}
                      max={3600}
                      value={Number.isNaN(field.state.value) ? '' : field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                      aria-invalid={invalid || undefined}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>seconds</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription>
                    How long to wait before replying again in the same channel.
                  </FieldDescription>
                  <FieldError errors={errors} />
                </Field>
              )
            }}
          </form.Field>

          <form.Field name="enabled">
            {(field) => (
              <Field orientation="horizontal">
                <FieldLabel htmlFor={field.name}>Enabled</FieldLabel>
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
          <form.Subscribe
            selector={(state) => ({
              trigger: state.values.trigger,
              matchType: state.values.matchType,
              caseSensitive: state.values.caseSensitive,
            })}
          >
            {(rule) => <MatchTester rule={rule} />}
          </form.Subscribe>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Preview</span>
            <form.Subscribe selector={(state) => state.values.response}>
              {(response) => (
                <DiscordMessage
                  author={status?.username ?? 'Your bot'}
                  avatarUrl={status?.avatar ?? undefined}
                  content={response || 'Your reply appears here.'}
                />
              )}
            </form.Subscribe>
          </div>
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
              {responder ? 'Save auto-responder' : 'Create auto-responder'}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}

export function ResponderDialog({
  guildId,
  responder,
  open,
  onOpenChange,
}: {
  guildId: string
  responder?: ResponderDto
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {responder ? 'Edit auto-responder' : 'New auto-responder'}
          </DialogTitle>
          <DialogDescription>
            The bot replies when a message in this server matches the trigger.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ResponderForm
            key={responder?.id ?? 'new'}
            guildId={guildId}
            responder={responder}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
