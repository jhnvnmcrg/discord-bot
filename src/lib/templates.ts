// Message placeholders, shared by the bot (real values) and the dashboard
// previews (sample values).

export const DEFAULT_WELCOME_MESSAGE =
  'Welcome to {server}, {user}! You are member #{memberCount}.'

export const PLACEHOLDERS = [
  { key: 'user', description: 'Mentions the member' },
  { key: 'user.name', description: "The member's display name" },
  { key: 'server', description: 'The server name' },
  { key: 'memberCount', description: 'How many members the server has' },
  { key: 'channel', description: 'Mentions the channel' },
  { key: 'ping', description: 'Where the ping goes (otherwise at the start)' },
] as const

export type PlaceholderKey = (typeof PLACEHOLDERS)[number]['key']
export type TemplateVars = Partial<Record<PlaceholderKey, string>>

const PLACEHOLDER_PATTERN = /\{(user\.name|user|server|memberCount|channel|ping)\}/g

export function renderTemplate(template: string, vars: TemplateVars) {
  return template.replace(
    PLACEHOLDER_PATTERN,
    (match, key: PlaceholderKey) => vars[key] ?? match,
  )
}

export type TemplateToken =
  | { type: 'text'; value: string }
  | { type: 'placeholder'; key: PlaceholderKey }

/** Splits a template so previews can style placeholders (e.g. as mentions). */
export function tokenizeTemplate(template: string): TemplateToken[] {
  const tokens: TemplateToken[] = []
  let last = 0
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const index = match.index ?? 0
    if (index > last) {
      tokens.push({ type: 'text', value: template.slice(last, index) })
    }
    tokens.push({ type: 'placeholder', key: match[1] as PlaceholderKey })
    last = index + match[0].length
  }
  if (last < template.length) {
    tokens.push({ type: 'text', value: template.slice(last) })
  }
  return tokens
}
