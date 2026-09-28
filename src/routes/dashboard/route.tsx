import { useQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useMatches,
  useParams,
} from '@tanstack/react-router'
import { ShieldAlertIcon } from 'lucide-react'
import { Fragment } from 'react'

import { AppSidebar } from '#/components/app-sidebar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb'
import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import { Separator } from '#/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '#/components/ui/sidebar'
import { Spinner } from '#/components/ui/spinner'
import { queries } from '#/lib/api'
import { fetchViewer } from '#/lib/viewer.functions'

export const Route = createFileRoute('/dashboard')({
  // The dashboard is a client app over the REST API; nothing here needs SSR.
  ssr: false,
  beforeLoad: async ({ context }) => {
    // UX only: every /api route enforces admin access on its own.
    const viewer = await context.queryClient.fetchQuery({
      queryKey: ['viewer'],
      queryFn: () => fetchViewer(),
      // Re-check signed-out results immediately so a fresh sign-in is seen.
      staleTime: (query) => (query.state.data?.userId ? 60_000 : 0),
    })
    if (!viewer.userId) throw redirect({ to: '/' })
    return { viewer }
  },
  pendingComponent: DashboardPending,
  component: DashboardLayout,
})

function DashboardPending() {
  return (
    <div className="flex min-h-svh items-center justify-center text-muted-foreground">
      <Spinner className="size-6" />
    </div>
  )
}

function NotAuthorized({ userId }: { userId: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Empty className="max-w-md border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldAlertIcon />
          </EmptyMedia>
          <EmptyTitle>This account can't manage the bot</EmptyTitle>
          <EmptyDescription>
            Add your user id to <code>ADMIN_USER_IDS</code> in the server's
            environment, then reload this page.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <code className="rounded-md bg-muted px-2 py-1 text-sm select-all">
            {userId}
          </code>
          <Button variant="outline" asChild>
            <Link to="/">Back to home</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}

function DashboardBreadcrumb() {
  const { guildId } = useParams({ strict: false })
  const { data: guilds } = useQuery(queries.guilds())
  const guild = guilds?.find((g) => g.id === guildId)
  const title = useMatches({
    select: (matches) => matches.at(-1)?.staticData.title,
  })

  const crumbs: { label: string; link?: React.ReactNode }[] = []
  if (guildId) {
    crumbs.push({
      label: 'All servers',
      link: <Link to="/dashboard">All servers</Link>,
    })
    crumbs.push({
      label: guild?.name ?? 'Server',
      link: title ? (
        <Link to="/dashboard/$guildId" params={{ guildId }}>
          {guild?.name ?? 'Server'}
        </Link>
      ) : undefined,
    })
  } else {
    crumbs.push({ label: 'All servers' })
  }
  if (title) crumbs.push({ label: title })

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.label}>
            {index > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem>
              {crumb.link && index < crumbs.length - 1 ? (
                <BreadcrumbLink asChild>{crumb.link}</BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function DashboardLayout() {
  const { viewer } = Route.useRouteContext()
  if (!viewer.isAdmin) return <NotAuthorized userId={viewer.userId ?? ''} />

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <DashboardBreadcrumb />
        </header>
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
