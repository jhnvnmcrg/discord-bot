import { useQuery } from '@tanstack/react-query'
import { TriangleAlertIcon } from 'lucide-react'

import { MemberPicker } from '#/components/member-picker'
import { Alert, AlertDescription } from '#/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import type { MentionTarget } from '#/db/schema'
import { queries } from '#/lib/api'
import type { ChannelOption, MemberOption, RoleOption } from '#/lib/api-types'
import type { MentionInput } from '#/lib/schemas'
import type { PlaceholderKey } from '#/lib/templates'

// One control for "who does this message ping": nobody, a member, a role,
// @here or @everyone. Forms keep it as a flat PingValue and send MentionInput.

export type PingType = 'none' | 'member' | 'role' | 'here' | 'everyone'
export type PingValue = { type: PingType; userId: string; roleId: string }

export const NO_PING: PingValue = { type: 'none', userId: '', roleId: '' }

const OPTIONS: { value: PingType; label: string }[] = [
  { value: 'none', label: 'Nobody' },
  { value: 'member', label: 'Member' },
  { value: 'role', label: 'Role' },
  { value: 'here', label: '@here' },
  { value: 'everyone', label: '@everyone' },
]

export function toMentionInput(value: PingValue): MentionInput | null {
  switch (value.type) {
    case 'none':
      return null
    case 'member':
      return { type: 'member', userId: value.userId }
    case 'role':
      return { type: 'role', roleId: value.roleId }
    default:
      return { type: value.type }
  }
}

export function fromMentionTarget(target: MentionTarget | null): PingValue {
  if (!target) return NO_PING
  if (target.type === 'member') return { ...NO_PING, type: 'member', userId: target.id }
  if (target.type === 'role') return { ...NO_PING, type: 'role', roleId: target.id }
  return { ...NO_PING, type: target.type }
}

/** Placeholders a message can use for the current ping. */
export function pingPlaceholderKeys(type: PingType): PlaceholderKey[] {
  if (type === 'none') return []
  return type === 'member' ? ['ping', 'user', 'user.name'] : ['ping']
}

/** How the ping reads in a preview, e.g. "@Game Night". */
export function pingPreviewText(
  value: PingValue,
  member?: MemberOption,
  roles?: RoleOption[],
) {
  switch (value.type) {
    case 'member':
      return `@${member?.displayName ?? 'member'}`
    case 'role':
      return `@${roles?.find((r) => r.id === value.roleId)?.name ?? 'role'}`
    case 'here':
      return '@here'
    case 'everyone':
      return '@everyone'
    default:
      return ''
  }
}

/** The line under a preview saying exactly who gets a ping. */
export function pingNote(value: PingValue, member?: MemberOption, roles?: RoleOption[]) {
  switch (value.type) {
    case 'none':
      return 'Nobody gets a ping. @everyone and mentions show as text.'
    case 'member':
      return `Only ${member?.displayName ?? 'the member'} gets a ping. Any other mentions, like @everyone, show as text.`
    case 'role':
      return `Everyone with ${pingPreviewText(value, member, roles)} gets a ping. Any other mentions show as text.`
    case 'here':
      return 'Online members who can see the channel get a ping. Any other mentions show as text.'
    case 'everyone':
      return 'Everyone who can see the channel gets a ping. Any other mentions show as text.'
  }
}

function roleColor(role: RoleOption) {
  return role.color ? `#${role.color.toString(16).padStart(6, '0')}` : 'var(--muted-foreground)'
}

export function PingPicker({
  id,
  guildId,
  value,
  onChange,
  member,
  onMemberChange,
  channel,
  invalid,
}: {
  id: string
  guildId: string
  value: PingValue
  onChange: (value: PingValue) => void
  member?: MemberOption
  onMemberChange: (member?: MemberOption) => void
  /** The target channel, used to warn when the bot can't ping there. */
  channel?: ChannelOption
  invalid?: boolean
}) {
  const roles = useQuery({ ...queries.roles(guildId), enabled: value.type === 'role' })
  const role = roles.data?.find((r) => r.id === value.roleId)

  const needsPermission =
    value.type === 'here' ||
    value.type === 'everyone' ||
    (value.type === 'role' && !!role && !role.mentionable)
  const blocked = needsPermission && channel && !channel.canMentionEveryone

  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup
        type="single"
        variant="outline"
        className="flex-wrap"
        value={value.type}
        onValueChange={(next) => {
          if (next) onChange({ ...value, type: next as PingType })
        }}
      >
        {OPTIONS.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {value.type === 'member' ? (
        <MemberPicker
          id={id}
          guildId={guildId}
          value={member}
          onChange={(next) => {
            onMemberChange(next)
            onChange({ ...value, userId: next?.id ?? '' })
          }}
          invalid={invalid}
        />
      ) : null}

      {value.type === 'role' ? (
        <Select
          value={value.roleId}
          onValueChange={(next) => next && onChange({ ...value, roleId: next })}
          disabled={!roles.data}
        >
          <SelectTrigger id={id} className="w-full max-w-sm" aria-invalid={invalid || undefined}>
            <SelectValue placeholder={roles.data ? 'Pick a role' : 'Loading roles…'} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {roles.data?.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: roleColor(option) }}
                  />
                  {option.name}
                  {option.mentionable ? null : (
                    <span className="text-xs text-muted-foreground">
                      needs Mention @everyone
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : null}

      {blocked ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertDescription>
            The bot isn't allowed to ping {value.type === 'role' ? 'this role' : `@${value.type}`}{' '}
            in #{channel.name}, so Discord would post the message without the ping.
            Give the bot's role "Mention @everyone, @here, and All Roles" (in Server
            Settings or on this channel){value.type === 'role' ? ', or turn on "Allow anyone to @mention this role"' : ''}.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
