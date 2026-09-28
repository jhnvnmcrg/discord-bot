import { createFileRoute, Link, notFound, Outlet } from '@tanstack/react-router'
import { ServerOffIcon } from 'lucide-react'

import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import { ApiRequestError, queries } from '#/lib/api'

export const Route = createFileRoute('/dashboard/$guildId')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(queries.guild(params.guildId))
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) throw notFound()
      throw error
    }
  },
  notFoundComponent: GuildNotFound,
  component: Outlet,
})

function GuildNotFound() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ServerOffIcon />
        </EmptyMedia>
        <EmptyTitle>The bot isn't in this server</EmptyTitle>
        <EmptyDescription>
          It may have been removed, or the link is wrong. Its settings are kept
          if you add it back.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" asChild>
          <Link to="/dashboard">See all servers</Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}
