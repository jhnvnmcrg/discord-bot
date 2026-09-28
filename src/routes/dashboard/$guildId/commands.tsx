import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  EllipsisIcon,
  PencilIcon,
  PlusIcon,
  SlashSquareIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { CommandDialog } from '#/components/command-dialog'
import { ConfirmDelete } from '#/components/confirm-delete'
import { PageHeader } from '#/components/page-header'
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
  useDeleteCommand,
  useUpdateCommand,
} from '#/lib/api'
import type { CommandDto } from '#/lib/api-types'
import { MAX_COMMANDS_PER_GUILD } from '#/lib/schemas'

export const Route = createFileRoute('/dashboard/$guildId/commands')({
  staticData: { title: 'Slash commands' },
  component: CommandsPage,
})

function CommandsPage() {
  const { guildId } = Route.useParams()
  const { data: commands } = useQuery(queries.commands(guildId))
  const update = useUpdateCommand(guildId)
  const remove = useDeleteCommand(guildId)

  const [editing, setEditing] = useState<CommandDto | undefined>()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<CommandDto | undefined>()

  const openEditor = (command?: CommandDto) => {
    setEditing(command)
    setDialogOpen(true)
  }

  const atLimit = (commands?.length ?? 0) >= MAX_COMMANDS_PER_GUILD

  return (
    <>
      <PageHeader
        title="Slash commands"
        description="Commands people can type in this server. Each one replies with a message or an embed."
        actions={
          <Button onClick={() => openEditor()} disabled={atLimit}>
            <PlusIcon data-icon="inline-start" />
            New command
          </Button>
        }
      />

      {!commands ? (
        <Skeleton className="h-48" />
      ) : commands.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SlashSquareIcon />
            </EmptyMedia>
            <EmptyTitle>No commands yet</EmptyTitle>
            <EmptyDescription>
              Create one like /rules or /links, and it shows up in Discord's
              command picker for this server.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => openEditor()}>
              <PlusIcon data-icon="inline-start" />
              New command
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Command</TableHead>
                <TableHead className="hidden md:table-cell">Replies with</TableHead>
                <TableHead className="w-24">Enabled</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commands.map((command) => (
                <TableRow key={command.id}>
                  <TableCell className="max-w-0 pl-4">
                    <button
                      type="button"
                      className="flex w-full min-w-0 flex-col items-start gap-0.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => openEditor(command)}
                    >
                      <code className="font-medium text-white">/{command.name}</code>
                      <span className="w-full truncate text-sm text-muted-foreground">
                        {command.description}
                      </span>
                    </button>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex gap-1.5">
                      <Badge variant="secondary">
                        {command.responseType === 'embed' ? 'Embed' : 'Message'}
                      </Badge>
                      {command.ephemeral ? (
                        <Badge variant="outline">Only sender sees it</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={command.enabled}
                      aria-label={`Enable /${command.name}`}
                      onCheckedChange={(enabled) =>
                        update.mutate(
                          { id: command.id, patch: { enabled } },
                          {
                            onSuccess: () =>
                              toast.success(
                                enabled
                                  ? `Turned on /${command.name}`
                                  : `Turned off /${command.name}`,
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
                        <Button variant="ghost" size="icon" aria-label={`Actions for /${command.name}`}>
                          <EllipsisIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem onSelect={() => openEditor(command)}>
                            <PencilIcon />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setDeleting(command)}
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

      <CommandDialog
        guildId={guildId}
        command={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={`Delete /${deleting?.name}?`}
        description="The command disappears from Discord for everyone in this server. This can't be undone."
        onConfirm={() => {
          if (!deleting) return
          const { id, name } = deleting
          remove.mutate(id, {
            onSuccess: () => toast.success(`Deleted /${name}`),
            onError: (error) => toast.error(errorMessage(error)),
          })
        }}
      />
    </>
  )
}
