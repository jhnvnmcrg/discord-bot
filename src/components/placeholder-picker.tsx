import { Button } from '#/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { PLACEHOLDERS, type PlaceholderKey } from '#/lib/templates'

/** Buttons that append a {placeholder} to a message field. */
export function PlaceholderPicker({
  onInsert,
  keys = PLACEHOLDERS.map((p) => p.key),
}: {
  onInsert: (token: string) => void
  keys?: readonly PlaceholderKey[]
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Insert</span>
      {PLACEHOLDERS.filter((p) => keys.includes(p.key)).map((placeholder) => (
        <Tooltip key={placeholder.key}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-6 px-2 font-mono text-xs"
              onClick={() => onInsert(`{${placeholder.key}}`)}
            >
              {`{${placeholder.key}}`}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{placeholder.description}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

/** Props for a TanStack Form field's error state, in shadcn's Field convention. */
export function fieldErrors(meta: {
  isTouched: boolean
  errors: unknown[]
}) {
  const errors = meta.isTouched
    ? (meta.errors as ({ message?: string } | string | undefined)[]).map((e) =>
        typeof e === 'string' ? { message: e } : e,
      )
    : []
  return { invalid: errors.length > 0, errors }
}
