import type { MATCH_TYPES } from './schemas.ts'

// Auto-responder matching, shared by the bot and the dashboard's tester so a
// preview match is exactly what the bot will do.

export type MatchRule = {
  trigger: string
  matchType: (typeof MATCH_TYPES)[number]
  caseSensitive: boolean
}

/** Returns a predicate for message content, or undefined if the regex is invalid. */
export function compileMatcher(
  rule: MatchRule,
): ((content: string) => boolean) | undefined {
  if (rule.matchType === 'regex') {
    try {
      const pattern = new RegExp(rule.trigger, rule.caseSensitive ? 'u' : 'iu')
      return (content) => pattern.test(content)
    } catch {
      return undefined
    }
  }

  const normalize = (text: string) =>
    rule.caseSensitive ? text : text.toLowerCase()
  const trigger = normalize(rule.trigger.trim())
  if (!trigger) return undefined

  switch (rule.matchType) {
    case 'exact':
      return (content) => normalize(content.trim()) === trigger
    case 'startsWith':
      return (content) => normalize(content.trimStart()).startsWith(trigger)
    default:
      return (content) => normalize(content).includes(trigger)
  }
}
