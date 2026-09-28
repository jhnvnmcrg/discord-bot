import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type InteractionReplyOptions,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { and, asc, count, eq, inArray, lte } from 'drizzle-orm'

import { db } from '#/db/index.ts'
import {
  guilds,
  memberTimezones,
  type Reminder,
  reminders,
} from '#/db/schema.ts'
import {
  currentZoneName,
  isValidTimezone,
  listTimezones,
  MISSED_AFTER_MS,
} from '#/lib/schedule.ts'

import { reminderSettingsFor } from './config-cache.ts'
import { logActivity, logError } from './log.ts'
import { parseReminderTime } from './reminder-time.ts'

const MAX_TEXT = 500
const BATCH_SIZE = 50

export const remindCommand = new SlashCommandBuilder()
  .setName('remind')
  .setDescription('Set a reminder for yourself')
  .addSubcommand((sub) =>
    sub
      .setName('me')
      .setDescription('Remind me about something later')
      .addStringOption((o) =>
        o
          .setName('when')
          .setDescription('For example: in 2h, tomorrow 9am, friday 8pm')
          .setRequired(true)
          .setMaxLength(100),
      )
      .addStringOption((o) =>
        o
          .setName('what')
          .setDescription('What to remind you about')
          .setRequired(true)
          .setMaxLength(MAX_TEXT),
      )
      .addBooleanOption((o) =>
        o.setName('private').setDescription('Send it as a DM instead of in this channel'),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('Show your upcoming reminders in this server'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('cancel')
      .setDescription('Cancel one of your reminders')
      .addStringOption((o) =>
        o
          .setName('reminder')
          .setDescription('The reminder to cancel')
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('timezone')
      .setDescription('Set the time zone used to read times like "tomorrow 9am"')
      .addStringOption((o) =>
        o
          .setName('zone')
          .setDescription('For example: Europe/London, America/New_York')
          .setAutocomplete(true),
      ),
  )
  .toJSON()

const timestamp = (date: Date, style: 'F' | 'R' | 'f') =>
  `<t:${Math.floor(date.getTime() / 1000)}:${style}>`

async function memberTimezone(userId: string) {
  const [row] = await db
    .select()
    .from(memberTimezones)
    .where(eq(memberTimezones.userId, userId))
  return row?.timezone
}

function pendingFor(guildId: string, userId: string) {
  return and(
    eq(reminders.guildId, guildId),
    eq(reminders.userId, userId),
    eq(reminders.status, 'pending'),
  )
}

const ephemeral = (content: string): InteractionReplyOptions => ({
  content,
  flags: MessageFlags.Ephemeral,
  allowedMentions: { parse: [] },
})

async function remindMe(interaction: ChatInputCommandInteraction, guildId: string) {
  const settings = reminderSettingsFor(guildId)
  const when = interaction.options.getString('when', true)
  const what = interaction.options.getString('what', true).trim().slice(0, MAX_TEXT)
  const isPrivate = interaction.options.getBoolean('private') ?? false

  const [{ total }] = await db
    .select({ total: count() })
    .from(reminders)
    .where(pendingFor(guildId, interaction.user.id))
  if (total >= settings.maxPerMember) {
    await interaction.reply(
      ephemeral(
        `You already have ${total} reminders here, the most this server allows. Cancel one with \`/remind cancel\` first.`,
      ),
    )
    return
  }

  const ownZone = await memberTimezone(interaction.user.id)
  const timezone = ownZone ?? settings.defaultTimezone
  const parsed = parseReminderTime(when, timezone)
  if (!parsed.ok) {
    await interaction.reply(ephemeral(parsed.error))
    return
  }

  const [created] = await db
    .insert(reminders)
    .values({
      guildId,
      userId: interaction.user.id,
      username: interaction.user.username,
      channelId: interaction.channelId,
      text: what,
      dueAt: parsed.dueAt,
      delivery: isPrivate ? 'dm' : 'channel',
    })
    .returning()

  const where = isPrivate ? 'by DM' : 'in this channel'
  const zoneNote =
    parsed.dependsOnZone && !ownZone
      ? `\n-# I read "${when}" in ${timezone}. If that's wrong, set yours with \`/remind timezone\`.`
      : ''
  await interaction.reply(
    ephemeral(
      `Got it. I'll remind you ${where} ${timestamp(created.dueAt, 'F')} (${timestamp(created.dueAt, 'R')}).${zoneNote}`,
    ),
  )
}

async function listReminders(interaction: ChatInputCommandInteraction, guildId: string) {
  const rows = await db
    .select()
    .from(reminders)
    .where(pendingFor(guildId, interaction.user.id))
    .orderBy(asc(reminders.dueAt))
    .limit(10)
  if (rows.length === 0) {
    await interaction.reply(
      ephemeral('You have no upcoming reminders here. Set one with `/remind me`.'),
    )
    return
  }
  const lines = rows.map(
    (r) =>
      `- ${timestamp(r.dueAt, 'R')} ${r.delivery === 'dm' ? '(DM) ' : ''}${r.text.slice(0, 120)}`,
  )
  await interaction.reply(
    ephemeral(`Your upcoming reminders:\n${lines.join('\n')}`),
  )
}

async function cancelReminder(interaction: ChatInputCommandInteraction, guildId: string) {
  const id = Number(interaction.options.getString('reminder', true))
  const deleted = Number.isInteger(id)
    ? await db
        .delete(reminders)
        .where(and(eq(reminders.id, id), pendingFor(guildId, interaction.user.id)))
        .returning()
    : []
  await interaction.reply(
    ephemeral(
      deleted[0]
        ? `Cancelled your reminder: ${deleted[0].text.slice(0, 200)}`
        : "I couldn't find that reminder. Pick one from the list as you type.",
    ),
  )
}

async function setTimezone(interaction: ChatInputCommandInteraction, guildId: string) {
  const zone = interaction.options.getString('zone')?.trim()
  if (!zone) {
    const current = await memberTimezone(interaction.user.id)
    await interaction.reply(
      ephemeral(
        current
          ? `Your time zone is ${current}.`
          : `You haven't set a time zone, so this server's default (${reminderSettingsFor(guildId).defaultTimezone}) is used.`,
      ),
    )
    return
  }
  if (!isValidTimezone(zone)) {
    await interaction.reply(
      ephemeral(`"${zone}" isn't a time zone I know. Pick one from the list as you type.`),
    )
    return
  }
  const timezone = currentZoneName(zone)
  await db
    .insert(memberTimezones)
    .values({ userId: interaction.user.id, timezone })
    .onConflictDoUpdate({ target: memberTimezones.userId, set: { timezone } })
  const now = new Date().toLocaleString('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  await interaction.reply(
    ephemeral(
      `Your time zone is now ${timezone} (it's ${now} there). This applies in every server.`,
    ),
  )
}

export async function handleRemind(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId
  if (!guildId) return
  if (!reminderSettingsFor(guildId).enabled) {
    await interaction.reply(ephemeral('Reminders are turned off in this server.'))
    return
  }
  const sub = interaction.options.getSubcommand()
  if (sub === 'me') return remindMe(interaction, guildId)
  if (sub === 'list') return listReminders(interaction, guildId)
  if (sub === 'cancel') return cancelReminder(interaction, guildId)
  if (sub === 'timezone') return setTimezone(interaction, guildId)
}

const ZONES = listTimezones()

export async function handleRemindAutocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused(true)
  const query = focused.value.toLowerCase().replaceAll(' ', '_')

  if (focused.name === 'zone') {
    await interaction.respond(
      ZONES.filter((zone) => zone.toLowerCase().includes(query))
        .slice(0, 25)
        .map((zone) => ({ name: zone.replaceAll('_', ' '), value: zone })),
    )
    return
  }

  if (focused.name === 'reminder' && interaction.guildId) {
    const zone =
      (await memberTimezone(interaction.user.id)) ??
      reminderSettingsFor(interaction.guildId).defaultTimezone
    const rows = await db
      .select()
      .from(reminders)
      .where(pendingFor(interaction.guildId, interaction.user.id))
      .orderBy(asc(reminders.dueAt))
      .limit(25)
    await interaction.respond(
      rows
        .filter((r) => r.text.toLowerCase().includes(focused.value.toLowerCase()))
        .map((r) => {
          const when = r.dueAt.toLocaleString('en-GB', {
            timeZone: zone,
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
          return { name: `${when}: ${r.text}`.slice(0, 100), value: String(r.id) }
        }),
    )
  }
}

// Delivery, called from the scheduler tick.

/** Marks due reminders as sent in one transaction, so each is delivered at most once. */
async function claimDue(guildIds: string[], now: Date) {
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.status, 'pending'),
          lte(reminders.dueAt, now),
          inArray(reminders.guildId, guildIds),
        ),
      )
      .orderBy(asc(reminders.dueAt))
      .limit(BATCH_SIZE)
      .for('update', { skipLocked: true })
    if (due.length > 0) {
      await tx
        .update(reminders)
        .set({ status: 'sent', sentAt: now })
        .where(
          inArray(
            reminders.id,
            due.map((r) => r.id),
          ),
        )
    }
    return due
  })
}

async function deliver(client: Client<true>, reminder: Reminder, now: Date) {
  // Unlike scheduled messages, a late personal reminder is still worth sending.
  const late =
    now.getTime() - reminder.dueAt.getTime() > MISSED_AFTER_MS
      ? '\n-# This is late: the bot was offline when it was due.'
      : ''
  const setAt = `-# Set ${timestamp(reminder.createdAt, 'R')}`

  if (reminder.delivery === 'channel') {
    const channel = await client.channels.fetch(reminder.channelId).catch(() => null)
    if (
      channel?.isSendable() &&
      'guildId' in channel &&
      channel.guildId === reminder.guildId
    ) {
      await channel.send({
        content: `⏰ <@${reminder.userId}>, you asked me to remind you: ${reminder.text}\n${setAt}${late}`,
        allowedMentions: { users: [reminder.userId] },
      })
      return 'channel' as const
    }
    // The channel is gone or closed to the bot; the text was public anyway, so DM it.
  }

  const [guild] = await db
    .select({ name: guilds.name })
    .from(guilds)
    .where(eq(guilds.id, reminder.guildId))
  const user = await client.users.fetch(reminder.userId)
  await user.send({
    content: `⏰ Reminder from **${guild?.name ?? 'a server'}**: ${reminder.text}\n${setAt} in <#${reminder.channelId}>${late}`,
    allowedMentions: { parse: [] },
  })
  return 'dm' as const
}

export async function deliverDueReminders(client: Client<true>, guildIds: string[], now: Date) {
  for (const reminder of await claimDue(guildIds, now)) {
    try {
      const deliveredVia = await deliver(client, reminder, now)
      await logActivity({
        guildId: reminder.guildId,
        type: 'reminder',
        name: reminder.text.slice(0, 100),
        userId: reminder.userId,
        channelId: reminder.channelId,
        metadata: { username: reminder.username, via: deliveredVia, reminderId: reminder.id },
      })
    } catch (error) {
      // Most often the member has DMs from server members turned off.
      const message =
        error instanceof Error ? error.message : 'Could not deliver the reminder.'
      await db
        .update(reminders)
        .set({ status: 'failed', lastError: message })
        .where(eq(reminders.id, reminder.id))
        .catch(() => {})
      await logError(reminder.guildId, 'reminder', error, {
        username: reminder.username,
        reminderId: reminder.id,
      })
    }
  }
}
