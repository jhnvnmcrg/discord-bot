import { chat, type ModelMessage } from '@tanstack/ai'
import { geminiText } from '@tanstack/ai-gemini'
import { ollamaText } from '@tanstack/ai-ollama'

// The AI chat brain, shared by the bot (replies in Discord) and the dashboard
// ("Try it"). Server-side only.
//
// Two backends, picked with AI_PROVIDER:
// - ollama (default): a model running on this machine through Ollama. No API
//   key, no cloud, nothing leaves the computer.
// - gemini: Google Gemini, with GEMINI_API_KEY.

export type AiProvider = 'ollama' | 'gemini'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'
/** Tried in order when the preferred model is overloaded or rate-limited. */
const FALLBACK_MODELS = ['gemini-3.7-flash', 'gemini-3.5-flash-lite','gemini-3.5-flash', 'gemini-2.5-flash']
export const MAX_PERSONA_LENGTH = 1000
/** Replies longer than one Discord message are split, up to this many messages. */
export const MAX_REPLY_MESSAGES = 3
/** Local models can be slow on first load; give up after this long. */
const REPLY_TIMEOUT_MS = 120_000

type GeminiModel = Parameters<typeof geminiText>[0]

export function aiProvider(): AiProvider {
  return process.env.AI_PROVIDER?.trim().toLowerCase() === 'gemini' ? 'gemini' : 'ollama'
}

/** Whether the chosen backend is set up enough to try (Ollama may still be off). */
export function aiChatConfigured() {
  if (aiProvider() === 'ollama') return true
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
}

export function geminiModel(): GeminiModel {
  return (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL) as GeminiModel
}

function geminiChain(): GeminiModel[] {
  return [...new Set([geminiModel(), ...FALLBACK_MODELS])] as GeminiModel[]
}

/** Overload, rate limit or server error: worth trying another Gemini model. */
function isTransient(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  return /\b(429|500|503)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(text)
}

// Ollama

export function ollamaHost() {
  return (process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/+$/, '')
}

let installed: { at: number; names: string[] } | undefined

/** Models pulled into the local Ollama, cached for a minute. */
export async function ollamaModels(): Promise<string[]> {
  if (installed && Date.now() - installed.at < 60_000) return installed.names
  const response = await fetch(`${ollamaHost()}/api/tags`, { signal: AbortSignal.timeout(3_000) })
  if (!response.ok) throw new Error(`Ollama answered ${response.status} at ${ollamaHost()}`)
  const body = (await response.json()) as { models?: { name: string }[] }
  installed = { at: Date.now(), names: (body.models ?? []).map((m) => m.name) }
  return installed.names
}

/** OLLAMA_MODEL, or else the first model that's been pulled. */
async function ollamaModel() {
  const wanted = process.env.OLLAMA_MODEL?.trim()
  if (wanted) return wanted
  const [first] = await ollamaModels()
  if (!first) throw new Error('No Ollama models are installed. Run: ollama pull qwen3')
  return first
}

/** True when the error means Ollama itself isn't reachable (not running). */
export function isOllamaDown(error: unknown) {
  const text = error instanceof Error ? `${error.message} ${String(error.cause ?? '')}` : String(error)
  return /ECONNREFUSED|fetch failed|ENOTFOUND|connect/i.test(text)
}

export type AiStatus = {
  provider: AiProvider
  /** Ready to answer right now. */
  ready: boolean
  model: string | null
  /** What to do when it isn't ready, in plain words. */
  detail: string
}

/** Checks the backend for the dashboard and the bot's startup log. */
export async function aiStatus(): Promise<AiStatus> {
  if (aiProvider() === 'gemini') {
    const ready = aiChatConfigured()
    return {
      provider: 'gemini',
      ready,
      model: geminiModel(),
      detail: ready ? 'Google Gemini' : 'Set GEMINI_API_KEY to use Gemini.',
    }
  }
  try {
    const names = await ollamaModels()
    const wanted = process.env.OLLAMA_MODEL?.trim()
    if (wanted && !names.some((n) => n === wanted || n === `${wanted}:latest`)) {
      return {
        provider: 'ollama',
        ready: false,
        model: wanted,
        detail: `The model ${wanted} isn't installed. Run: ollama pull ${wanted}`,
      }
    }
    const model = wanted ?? names[0] ?? null
    return model
      ? { provider: 'ollama', ready: true, model, detail: `Ollama at ${ollamaHost()}` }
      : {
          provider: 'ollama',
          ready: false,
          model: null,
          detail: 'No Ollama models are installed. Run: ollama pull qwen3',
        }
  } catch {
    return {
      provider: 'ollama',
      ready: false,
      model: process.env.OLLAMA_MODEL?.trim() || null,
      detail: `Ollama isn't running at ${ollamaHost()}. Start the Ollama app or run: ollama serve`,
    }
  }
}

// Prompting

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
  // Spelled out in full: small local models misread "Wed, 28 Oct".
  const today = now.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  return [
    `You are ${context.botName}, a bot in the Discord server "${context.server}"${
      context.channel ? `, talking in #${context.channel}` : ''
    }.`,
    'Chat naturally and helpfully, like a friendly member of the server. Keep replies short: a few sentences unless someone asks for detail, and never more than 1800 characters.',
    'Use Discord markdown when it helps (bold, lists, code blocks). Messages from people are shown as "name: message".',
    "Reply in the language of the member's latest message (Tagalog, Taglish, Hiligaynon, English or any other), unless the admins' instructions below say which language to use.",
    'Never try to ping @everyone, @here or roles. If you are unsure about something, say so instead of guessing.',
    `Today is ${today} (UTC).`,
    context.persona.trim()
      ? `The server admins gave you these instructions; follow them unless they conflict with the rules above:\n${context.persona.trim()}`
      : '',
    // Repeated last, where small models pay the most attention.
    `Remember: today is ${weekday}. "Tonight" means ${weekday} night, so check the day before saying something happens tonight.`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Models expect alternating turns, so consecutive turns from one side are merged. */
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

/** Some local models wrap their reasoning in <think> tags inside the answer. */
function stripThinking(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

/**
 * Gives up after REPLY_TIMEOUT_MS. The abort signal is passed on, but not every
 * adapter honours it, so the wait itself is also capped.
 */
async function withTimeout<T>(run: (abort: AbortController) => Promise<T>) {
  const abort = new AbortController()
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort.abort()
      reject(new Error(`The AI took longer than ${REPLY_TIMEOUT_MS / 1000}s to answer.`))
    }, REPLY_TIMEOUT_MS)
  })
  try {
    return await Promise.race([run(abort), timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** The answer, and which model gave it. */
export async function generateReply(
  turns: ChatTurn[],
  context: ChatContext,
  now = new Date(),
): Promise<{ text: string; model: string }> {
  const systemPrompts = [systemPrompt(context, now)]
  const messages = toMessages(turns)

  if (aiProvider() === 'ollama') {
    const model = await ollamaModel()
    const text = await withTimeout((abortController) =>
      chat({
        adapter: ollamaText(model),
        systemPrompts,
        messages,
        stream: false,
        abortController,
        debug: false,
        modelOptions: {
          // Typed as a full Ollama request; the adapter reads only the keys below.
          model,
          // Thinking models are much slower; a chat reply rarely needs it.
          think: process.env.OLLAMA_THINK === 'true',
          // Keep the model in memory between messages so replies stay quick.
          keep_alive: process.env.OLLAMA_KEEP_ALIVE || '30m',
        },
      }),
    )
    return { text: stripThinking(text), model }
  }

  let lastError: unknown
  for (const model of geminiChain()) {
    try {
      const text = await withTimeout((abortController) =>
        chat({
          adapter: geminiText(model),
          systemPrompts,
          messages,
          stream: false,
          abortController,
          // We report failures ourselves; TanStack would print every stack trace.
          debug: false,
        }),
      )
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
