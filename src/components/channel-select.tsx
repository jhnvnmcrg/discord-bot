import { HashIcon, MegaphoneIcon } from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import type { ChannelOption } from '#/lib/api-types'

/** A server's text and announcement channels, grouped by category. */
export function ChannelSelect({
  id,
  channels,
  value,
  onChange,
  invalid,
}: {
  id: string
  channels?: ChannelOption[]
  value: string
  onChange: (value: string) => void
  invalid?: boolean
}) {
  const groups = new Map<string, ChannelOption[]>()
  for (const channel of channels ?? []) {
    const key = channel.parentName ?? ''
    groups.set(key, [...(groups.get(key) ?? []), channel])
  }
  return (
    <Select
      value={value}
      onValueChange={(next) => next && onChange(next)}
      disabled={!channels}
    >
      <SelectTrigger id={id} className="w-full max-w-sm" aria-invalid={invalid || undefined}>
        <SelectValue placeholder={channels ? 'Pick a channel' : 'Loading channels…'} />
      </SelectTrigger>
      <SelectContent>
        {[...groups].map(([category, items]) => (
          <SelectGroup key={category || 'none'}>
            {category ? <SelectLabel>{category}</SelectLabel> : null}
            {items.map((channel) => (
              <SelectItem key={channel.id} value={channel.id}>
                {channel.type === 5 ? <MegaphoneIcon /> : <HashIcon />}
                {channel.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
