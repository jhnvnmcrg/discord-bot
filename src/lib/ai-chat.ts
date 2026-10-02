import { chat, type ModelMessage } from '@tanstack/ai'
import { geminiText } from '@tanstack/ai-gemini'

// The AI chat brain, shared by the bot (replies in Discord) and the dashboard
// ("Try it"). Server-side only: it calls Gemini with GEMINI_API_KEY.

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'
/** Tried in order when the preferred model is overloaded or rate-limited. */
const FALLBACK_MODELS = ['gemini-3.7-flash', 'gemini-3.5-flash-lite','gemini-3.5-flash', 'gemini-2.5-flash']
export const MAX_PERSONA_LENGTH = 1000
/** Replies longer than one Discord message are split, up to this many messages. */
export const MAX_REPLY_MESSAGES = 3

type GeminiModel = Parameters<typeof geminiText>[0]

export function aiChatConfigured() {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
}

export function geminiModel(): GeminiModel {
  return (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL) as GeminiModel
}

function modelChain(): GeminiModel[] {
  return [...new Set([geminiModel(), ...FALLBACK_MODELS])] as GeminiModel[]
}

/** Overload, rate limit or server error: worth trying another model. */
function isTransient(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  return /\b(429|500|503)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(text)
}

/** One message in the conversation, oldest first. */
export type ChatTurn = { fromBot: boolean; author: string; content: string }

export type ChatContext = {
  botName: string
  server: string
  channel?: string
  /** The admin's personality and instructions from the dashboard. */
  persona: string
}

function systemPrompt(context: ChatContext, now: Date) {
  return [
    `You are ${context.botName}, a bot in the Discord server "${context.server}"${
      context.channel ? `, talking in #${context.channel}` : ''
    }.`,
    'Chat naturally and helpfully, like a friendly member of the server. Keep replies short: a few sentences unless someone asks for detail, and never more than 1800 characters.',
    'Use Discord markdown when it helps (bold, lists, code blocks). Messages from people are shown as "name: message".',
    'Never try to ping @everyone, @here or roles. If you are unsure about something, say so instead of guessing.',
    `Today is ${now.toUTCString().slice(0, 16)} (UTC).`,
    context.persona.trim()
      ? `The server admins gave you these instructions; follow them unless they conflict with the rules above:\n${context.persona.trim()}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Gemini expects alternating turns, so consecutive turns from one side are merged. */
function toMessages(turns: ChatTurn[]): ModelMessage<string>[] {
  const messages: ModelMessage<string>[] = []
  for (const turn of turns) {
    const role = turn.fromBot ? 'assistant' : 'user'
    const content = turn.fromBot ? turn.content : `${turn.author}: ${turn.content}`
    const last = messages.at(-1)
    if (last?.role === role) last.content = `${last.content}\n${content}`
    else messages.push({ role, content })
  }
  return messages
}

/** The answer, and which model gave it (a fallback if the first was busy). */
export async function generateReply(
  turns: ChatTurn[],
  context: ChatContext,
  now = new Date(),
): Promise<{ text: string; model: string }> {
  const models = modelChain()
  let lastError: unknown
  for (const model of models) {
    try {
      const text = await chat({
        adapter: geminiText(model),
        systemPrompts: [systemPrompt(context, now)],
        messages: toMessages(turns),
        stream: false,
        // We report failures ourselves; TanStack would print every stack trace.
        debug: false,
      })
      return { text: text.trim(), model }
    } catch (error) {
      lastError = error
      if (!isTransient(error)) break
    }
  }
  throw lastError
}

/** Splits text into Discord-sized messages, preferring paragraph and line breaks. */
export function splitForDiscord(text: string, limit = 2000, maxParts = MAX_REPLY_MESSAGES) {
  const parts: string[] = []
  let rest = text.trim()
  while (rest && parts.length < maxParts) {
    if (rest.length <= limit) {
      parts.push(rest)
      rest = ''
      break
    }
    const window = rest.slice(0, limit)
    const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf('. ') + 1)
    const at = cut > limit / 2 ? cut : limit
    parts.push(rest.slice(0, at).trim())
    rest = rest.slice(at).trim()
  }
  if (rest && parts.length > 0) {
    const last = parts.length - 1
    parts[last] = `${parts[last].slice(0, limit - 2)} …`
  }
  return parts
}
