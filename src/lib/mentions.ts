import type { MentionSnapshot, MentionTarget } from '../db/schema.ts'

/** Reads a saved mention; entries from before role pings are members. */
export function asMentionTarget(
  saved: MentionTarget | MentionSnapshot | null | undefined,
): MentionTarget | null {
  if (!saved) return null
  return 'type' in saved ? saved : { type: 'member', ...saved }
}

/** "@Alex", "@Game Night", "@everyone": how a saved mention reads in the dashboard. */
export function mentionLabel(target: MentionTarget) {
  switch (target.type) {
    case 'member':
      return `@${target.displayName}`
    case 'role':
      return `@${target.name}`
    case 'everyone':
      return '@everyone'
    case 'here':
      return '@here'
  }
}
