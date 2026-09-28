import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { z } from 'zod'
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
import { errorMessage, queries, useSaveCommand } from '#/lib/api'
import type { CommandDto } from '#/lib/api-types'

import { commandFormInput } from '#/lib/schemas'

const BLURPLE = '#5865f2'

// A text reply simply ignores the embed fields.
type CommandFormValues = z.infer<typeof commandFormInput>

function toFormValues(command?: CommandDto): CommandFormValues {
  return {
    name: command?.name ?? '',
    description: command?.description ?? '',
    responseType: command?.responseType ?? 'text',
    content: command?.content ?? '',
    embed: {
      title: command?.embed?.title ?? '',
      description: command?.embed?.description ?? '',
      color: command?.embed?.color ?? BLURPLE,
    },
    ephemeral: command?.ephemeral ?? false,
    enabled: command?.enabled ?? true,
  }
}

function CommandForm({
  guildId,
  command,
  onDone,
}: {
  guildId: string
  command?: CommandDto
  onDone: () => void
}) {
  const save = useSaveCommand(guildId)
  const { data: status } = useQuery(queries.status())

  const form = useForm({
    defaultValues: toFormValues(command),
    validators: { onChange: commandFormInput },
    onSubmit: async ({ value }) => {
      try {
        const saved = await save.mutateAsync({ id: command?.id, input: value })
        toast.success(command ? `Saved /${saved.name}` : `Created /${saved.name}`)
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
          <form.Field name="name">
            {(field) => {
              const { invalid, errors } = fieldErrors(field.state.meta)
              return (
                <Field data-invalid={invalid || undefined}>
                  <FieldLabel htmlFor={field.name}>Command name</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText className="font-mono">/</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id={field.name}
                      name={field.name}
                      className="font-mono"
                      placeholder="hello"
                      autoComplete="off"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) =>
                        field.handleChange(
                          e.target.value.toLowerCase().replace(/\s+/g, '-'),
                        )
                      }
                      aria-invalid={invalid || undefined}
                    />
                  </InputGroup>
                  <FieldError errors={errors} />
                </Field>
              )
            }}
          </form.Field>

          <form.Field name="description">
            {(field) => {
              const { invalid, errors } = fieldErrors(field.state.meta)
              return (
                <Field data-invalid={invalid || undefined}>
                  <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    placeholder="Say hello to the bot"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={invalid || undefined}
                  />
                  <FieldDescription>
                    Shown next to the command when people type /.
                  </FieldDescription>
                  <FieldError errors={errors} />
                </Field>
              )
            }}
          </form.Field>

          <form.Field name="responseType">
            {(field) => (
              <Field>
                <FieldLabel>Reply with</FieldLabel>
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
                          name={field.name}
                          rows={4}
                          placeholder="Hey {user}, welcome to {server}!"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={invalid || undefined}
                        />
                        <PlaceholderPicker
                          onInsert={(token) =>
                            field.handleChange(field.state.value + token)
                          }
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
                            name={field.name}
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
                          name={field.name}
                          rows={4}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                        <PlaceholderPicker
                          onInsert={(token) =>
                            field.handleChange(field.state.value + token)
                          }
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

          <form.Field name="ephemeral">
            {(field) => (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor={field.name}>Only visible to the sender</FieldLabel>
                  <FieldDescription>
                    Everyone else in the channel won't see the reply.
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

          <form.Field name="enabled">
            {(field) => (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor={field.name}>Enabled</FieldLabel>
                  <FieldDescription>
                    Turned-off commands are removed from Discord until you turn
                    them back on.
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

        <div className="flex flex-col gap-2 md:sticky md:top-0 md:self-start">
          <span className="text-sm font-medium">Preview</span>
          <form.Subscribe selector={(state) => state.values}>
            {(values) => (
              <DiscordMessage
                author={status?.username ?? 'Your bot'}
                avatarUrl={status?.avatar ?? undefined}
                invokedBy={{ user: 'alex', command: values.name }}
                content={values.responseType === 'text' ? values.content : undefined}
                embed={values.responseType === 'embed' ? values.embed : undefined}
                ephemeral={values.ephemeral}
              />
            )}
          </form.Subscribe>
          <p className="text-xs text-muted-foreground">
            Placeholders show sample values here.
          </p>
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
              {command ? 'Save command' : 'Create command'}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}

export function CommandDialog({
  guildId,
  command,
  open,
  onOpenChange,
}: {
  guildId: string
  command?: CommandDto
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {command ? `Edit /${command.name}` : 'New slash command'}
          </DialogTitle>
          <DialogDescription>
            The bot registers it in this server within a few seconds of saving.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <CommandForm
            // Remount per command so default values reset.
            key={command?.id ?? 'new'}
            guildId={guildId}
            command={command}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
