import { z } from 'zod'

import { cronProblem, isValidTimezone } from './schedule.ts'

// Shared by the REST API (request validation) and the dashboard forms.
// Keep this file free of transforms so form input and output types match.

export const snowflake = z.string().regex(/^\d{17,20}$/, 'Not a Discord id')

const hexColor = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, 'Use a hex colour like #5865f2')

export const MAX_COMMANDS_PER_GUILD = 100

/** Built-in commands the bot registers itself; custom commands can't reuse them. */
export const RESERVED_COMMAND_NAMES = ['remind']

export const embedFields = z.object({
  title: z.string().max(256),
  description: z.string().max(4096),
  color: hexColor,
})

// A text message or an embed — used by slash commands and scheduled messages.
const replyFields = {
  responseType: z.enum(['text', 'embed']),
  content: z.string().max(2000, 'Messages can be at most 2000 characters'),
  embed: embedFields.nullable(),
}

type Reply = {
  responseType: 'text' | 'embed'
  content: string
  embed: z.infer<typeof embedFields> | null
}

function refineReply(value: Reply, ctx: z.RefinementCtx) {
  if (value.responseType === 'text' && value.content.trim() === '') {
    ctx.addIssue({
      code: 'custom',
      path: ['content'],
      message: 'Write the message the bot should send',
    })
  }
  if (
    value.responseType === 'embed' &&
    !value.embed?.title.trim() &&
    !value.embed?.description.trim()
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['embed', 'title'],
      message: 'Give the embed a title or a description',
    })
  }
}

export const commandFields = z.object({
  name: z
    .string()
    .regex(
      /^[-_\p{L}\p{N}]{1,32}$/u,
      'Use 1–32 letters, numbers, dashes or underscores, with no spaces',
    )
    .refine((name) => name === name.toLowerCase(), 'Use lowercase letters')
    .refine(
      (name) => !RESERVED_COMMAND_NAMES.includes(name),
      'This name is used by a built-in command',
    ),
  description: z
    .string()
    .trim()
    .min(1, 'Add a description')
    .max(100, 'Keep it under 100 characters'),
  ...replyFields,
  ephemeral: z.boolean(),
  enabled: z.boolean(),
})

export const commandInput = commandFields.superRefine(refineReply)

export type CommandInput = z.infer<typeof commandInput>

/** The dashboard form always carries an embed object so its fields can bind. */
export const commandFormInput = commandInput.safeExtend({ embed: embedFields })

export const MATCH_TYPES = ['contains', 'exact', 'startsWith', 'regex'] as const

export const responderFields = z.object({
  trigger: z
    .string()
    .trim()
    .min(1, 'Add a trigger')
    .max(200, 'Keep triggers under 200 characters'),
  matchType: z.enum(MATCH_TYPES),
  caseSensitive: z.boolean(),
  response: z
    .string()
    .trim()
    .min(1, 'Write the reply the bot should send')
    .max(2000, 'Messages can be at most 2000 characters'),
  cooldownSeconds: z
    .number()
    .int()
    .min(0, 'Cooldown cannot be negative')
    .max(3600, 'Cooldown can be at most an hour'),
  enabled: z.boolean(),
})

export const responderInput = responderFields.superRefine((value, ctx) => {
  if (value.matchType !== 'regex') return
  try {
    new RegExp(value.trigger, value.caseSensitive ? 'u' : 'iu')
  } catch {
    ctx.addIssue({
      code: 'custom',
      path: ['trigger'],
      message: 'This is not a valid regular expression',
    })
  }
})

export type ResponderInput = z.infer<typeof responderInput>

export const welcomeInput = z
  .object({
    enabled: z.boolean(),
    channelId: snowflake.nullable(),
    message: z
      .string()
      .trim()
      .min(1, 'Write a welcome message')
      .max(2000, 'Messages can be at most 2000 characters'),
    autoRoleId: snowflake.nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.enabled && !value.channelId) {
      ctx.addIssue({
        code: 'custom',
        path: ['channelId'],
        message: 'Pick the channel to post welcome messages in',
      })
    }
  })

export type WelcomeInput = z.infer<typeof welcomeInput>

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Pick a time')

export const scheduleSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('once'),
    at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, 'Pick a date and time'),
  }),
  z.object({ type: z.literal('daily'), time }),
  z.object({
    type: z.literal('weekly'),
    time,
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1, 'Pick at least one day')
      .max(7),
  }),
  z.object({
    type: z.literal('monthly'),
    time,
    day: z.union([z.number().int().min(1).max(28), z.literal('last')]),
  }),
  z.object({
    type: z.literal('cron'),
    expression: z
      .string()
      .trim()
      .min(1, 'Write a cron expression')
      .max(100)
      .superRefine((expression, ctx) => {
        const problem = cronProblem(expression)
        if (problem) ctx.addIssue({ code: 'custom', message: problem })
      }),
  }),
])

export const scheduledMessageFields = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give it a name')
    .max(100, 'Keep it under 100 characters'),
  channelId: z.string().regex(/^\d{17,20}$/, 'Pick a channel'),
  schedule: scheduleSchema,
  timezone: z.string().refine(isValidTimezone, 'Pick a time zone'),
  ...replyFields,
  enabled: z.boolean(),
})

export const scheduledMessageInput =
  scheduledMessageFields.superRefine(refineReply)

export type ScheduledMessageInput = z.infer<typeof scheduledMessageInput>

export const MAX_REMINDERS_PER_MEMBER_LIMIT = 50

export const reminderSettingsInput = z.object({
  enabled: z.boolean(),
  defaultTimezone: z.string().refine(isValidTimezone, 'Pick a time zone'),
  maxPerMember: z
    .number()
    .int()
    .min(1, 'Allow at least 1')
    .max(MAX_REMINDERS_PER_MEMBER_LIMIT, `At most ${MAX_REMINDERS_PER_MEMBER_LIMIT}`),
})

export type ReminderSettingsInput = z.infer<typeof reminderSettingsInput>

/** A message sent right away from the dashboard, to a channel or a member's DMs. */
export const sendMessageFields = z.object({
  target: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('channel'),
      channelId: z.string().regex(/^\d{17,20}$/, 'Pick a channel'),
    }),
    z.object({
      type: z.literal('dm'),
      userId: z.string().regex(/^\d{17,20}$/, 'Pick a member'),
    }),
  ]),
  ...replyFields,
})

export const sendMessageInput = sendMessageFields.superRefine(refineReply)

export type SendMessageInput = z.infer<typeof sendMessageInput>
