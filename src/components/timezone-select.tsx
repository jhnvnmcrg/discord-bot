import { cn } from 'cn'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { listTimezones } from '#/lib/schedule'

/** Every IANA time zone the browser knows; type to jump through the list. */
export function TimezoneSelect({
  id,
  value,
  onChange,
  className,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const zones = listTimezones()
  // Keep a saved value selectable even if it's an old name not in the list.
  if (value && !zones.includes(value)) zones.unshift(value)
  return (
    <Select value={value} onValueChange={(next) => next && onChange(next)}>
      <SelectTrigger id={id} className={cn('w-full max-w-xs', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {zones.map((zone) => (
            <SelectItem key={zone} value={zone}>
              {zone.replaceAll('_', ' ')}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
