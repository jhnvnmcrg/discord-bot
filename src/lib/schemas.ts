import { z } from 'zod'

// Shared by the REST API (request validation) and the dashboard forms.
// Keep this file free of transforms so form input and output types match.

export const snowflake = z.string().regex(/^\d{17,20}$/, 'Not a Discord id')

const hexColor = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, 'Use a hex colour like #5865f2')

export const MAX_COMMANDS_PER_GUILD = 100

export const embedFields = z.object({
  title: z.string().max(256),
  description: z.string().max(4096),
  color: hexColor,
})

export const commandFields = z.object({
  name: z
    .string()
    .regex(
      /^[-_\p{L}\p{N}]{1,32}$/u,
      'Use 1–32 letters, numbers, dashes or underscores, with no spaces',
    )
    .refine((name) => name === name.toLowerCase(), 'Use lowercase letters'),
  description: z
    .string()
    .trim()
    .min(1, 'Add a description')
    .max(100, 'Keep it under 100 characters'),
  responseType: z.enum(['text', 'embed']),
  content: z.string().max(2000, 'Messages can be at most 2000 characters'),
  embed: embedFields.nullable(),
  ephemeral: z.boolean(),
  enabled: z.boolean(),
})

export const commandInput = commandFields.superRefine((value, ctx) => {
  if (value.responseType === 'text' && value.content.trim() === '') {
    ctx.addIssue({
      code: 'custom',
      path: ['content'],
      message: 'Write the reply the bot should send',
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
})

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
