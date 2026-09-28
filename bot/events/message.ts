import { type Client, Events } from 'discord.js'

import { renderTemplate } from '#/lib/templates.ts'

import { getGuildConfig } from '../config-cache.ts'
import { logActivity, logError } from '../log.ts'
import { templateVars } from '../template-vars.ts'

// responderId:channelId -> time the cooldown ends
const cooldowns = new Map<string, number>()

function pruneCooldowns(now: number) {
  for (const [key, until] of cooldowns) {
    if (until <= now) cooldowns.delete(key)
  }
}

export function registerMessageEvents(client: Client) {
  setInterval(() => pruneCooldowns(Date.now()), 10 * 60_000).unref()

  client.on(Events.MessageCreate, async (message) => {
    if (!message.inGuild() || message.author.bot || message.webhookId) return
    if (message.system || !message.content) return

    // The first matching responder wins; one message gets at most one reply.
    const responder = getGuildConfig(message.guildId).responders.find((r) =>
      r.matches(message.content),
    )
    if (!responder) return

    const key = `${responder.id}:${message.channelId}`
    const now = Date.now()
    if ((cooldowns.get(key) ?? 0) > now) return
    cooldowns.set(key, now + responder.cooldownSeconds * 1000)

    try {
      const vars = templateVars({
        user: message.author,
        displayName: message.member?.displayName,
        guild: message.guild,
        channelId: message.channelId,
      })
      await message.reply({
        content: renderTemplate(responder.response, vars).slice(0, 2000),
        allowedMentions: { parse: ['users'], repliedUser: false },
      })
      await logActivity({
        guildId: message.guildId,
        type: 'autoresponse',
        name: String(responder.id),
        userId: message.author.id,
        channelId: message.channelId,
        metadata: {
          username: message.author.username,
          trigger: responder.trigger,
        },
      })
    } catch (error) {
      await logError(message.guildId, 'autoresponse', error, {
        trigger: responder.trigger,
        channelId: message.channelId,
      })
    }
  })
}
