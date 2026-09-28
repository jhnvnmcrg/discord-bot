import { useQuery } from '@tanstack/react-query'
import { SearchIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import { Spinner } from '#/components/ui/spinner'
import { errorMessage, queries } from '#/lib/api'
import type { MemberOption } from '#/lib/api-types'
import { initials } from '#/lib/discord'

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

function MemberAvatar({ member, className }: { member: MemberOption; className: string }) {
  return (
    <Avatar className={className}>
      <AvatarImage src={member.avatarUrl} alt="" />
      <AvatarFallback className="text-xs">{initials(member.displayName)}</AvatarFallback>
    </Avatar>
  )
}

/** Finds a server member by the start of their username or nickname. */
export function MemberPicker({
  id,
  guildId,
  value,
  onChange,
  invalid,
}: {
  id: string
  guildId: string
  value?: MemberOption
  onChange: (member?: MemberOption) => void
  invalid?: boolean
}) {
  const [query, setQuery] = useState('')
  const search = useDebounced(query.trim(), 300)
  const results = useQuery(queries.members(guildId, search))

  if (value) {
    return (
      <div className="flex max-w-sm items-center gap-3 rounded-md border bg-background px-3 py-2">
        <MemberAvatar member={value} className="size-8" />
        <div className="grid min-w-0 flex-1 leading-tight">
          <span className="truncate font-medium text-white">{value.displayName}</span>
          <span className="truncate text-xs text-muted-foreground">@{value.username}</span>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>
          Change
        </Button>
      </div>
    )
  }

  return (
    <div className="flex max-w-sm flex-col gap-2">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          placeholder="Start typing a name"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-invalid={invalid || undefined}
        />
        {results.isFetching ? (
          <InputGroupAddon align="inline-end">
            <Spinner />
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      {results.error ? (
        <p className="text-sm text-destructive">{errorMessage(results.error)}</p>
      ) : search && results.data ? (
        results.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No members have a name starting with "{search}".
          </p>
        ) : (
          <ul className="flex flex-col rounded-md border bg-popover p-1">
            {results.data.map((member) => (
              <li key={member.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
                  onClick={() => {
                    onChange(member)
                    setQuery('')
                  }}
                >
                  <MemberAvatar member={member} className="size-6" />
                  <span className="truncate font-medium text-white">{member.displayName}</span>
                  <span className="truncate text-muted-foreground">@{member.username}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  )
}
