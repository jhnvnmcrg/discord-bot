import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  EllipsisIcon,
  MessageSquareReplyIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDelete } from '#/components/confirm-delete'
import { PageHeader } from '#/components/page-header'
import { MATCH_LABELS, ResponderDialog } from '#/components/responder-dialog'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { Switch } from '#/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import {
  errorMessage,
  queries,
  useDeleteResponder,
  useUpdateResponder,
} from '#/lib/api'
import type { ResponderDto } from '#/lib/api-types'

export const Route = createFileRoute('/dashboard/$guildId/responders')({
  staticData: { title: 'Auto-responders' },
  component: RespondersPage,
})

function RespondersPage() {
  const { guildId } = Route.useParams()
  const { data: responders } = useQuery(queries.responders(guildId))
  const update = useUpdateResponder(guildId)
  const remove = useDeleteResponder(guildId)

  const [editing, setEditing] = useState<ResponderDto | undefined>()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<ResponderDto | undefined>()

  const openEditor = (responder?: ResponderDto) => {
    setEditing(responder)
    setDialogOpen(true)
  }

  return (
    <>
      <PageHeader
        title="Auto-responders"
        description="Replies the bot posts when a message matches a trigger. Messages from other bots are ignored."
        actions={
          <Button onClick={() => openEditor()}>
            <PlusIcon data-icon="inline-start" />
            New auto-responder
          </Button>
        }
      />

      {!responders ? (
        <Skeleton className="h-48" />
      ) : responders.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquareReplyIcon />
            </EmptyMedia>
            <EmptyTitle>No auto-responders yet</EmptyTitle>
            <EmptyDescription>
              Answer common questions automatically, like "where are the rules?"
              or "when is the next event?".
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => openEditor()}>
              <PlusIcon data-icon="inline-start" />
              New auto-responder
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Trigger</TableHead>
                <TableHead className="hidden md:table-cell">Reply</TableHead>
                <TableHead className="hidden w-28 sm:table-cell">Cooldown</TableHead>
                <TableHead className="w-24">Enabled</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {responders.map((responder) => (
                <TableRow key={responder.id}>
                  <TableCell className="max-w-0 pl-4">
                    <button
                      type="button"
                      className="flex w-full min-w-0 flex-col items-start gap-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => openEditor(responder)}
                    >
                      <Badge variant="secondary">{MATCH_LABELS[responder.matchType]}</Badge>
                      <code className="w-full truncate text-white">{responder.trigger}</code>
                    </button>
                  </TableCell>
                  <TableCell className="hidden max-w-0 md:table-cell">
                    <span className="block truncate text-muted-foreground">
                      {responder.response}
                    </span>
                  </TableCell>
                  <TableCell className="hidden tabular-nums text-muted-foreground sm:table-cell">
                    {responder.cooldownSeconds}s
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={responder.enabled}
                      aria-label={`Enable trigger ${responder.trigger}`}
                      onCheckedChange={(enabled) =>
                        update.mutate(
                          { id: responder.id, patch: { enabled } },
                          {
                            onSuccess: () =>
                              toast.success(
                                enabled
                                  ? 'Turned on auto-responder'
                                  : 'Turned off auto-responder',
                              ),
                            onError: (error) => toast.error(errorMessage(error)),
                          },
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Actions">
                          <EllipsisIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem onSelect={() => openEditor(responder)}>
                            <PencilIcon />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setDeleting(responder)}
                          >
                            <Trash2Icon />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <ResponderDialog
        guildId={guildId}
        responder={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="Delete this auto-responder?"
        description="The bot stops replying to this trigger right away. This can't be undone."
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting.id, {
            onSuccess: () => toast.success('Deleted auto-responder'),
            onError: (error) => toast.error(errorMessage(error)),
          })
        }}
      />
    </>
  )
}
