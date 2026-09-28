import { UserButton } from '@clerk/tanstack-react-start'
import { useQuery } from '@tanstack/react-query'
import { Link, useMatchRoute, useParams } from '@tanstack/react-router'
import {
  ActivityIcon,
  ChevronsUpDownIcon,
  HandIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  MessageSquareReplyIcon,
  PlusIcon,
  SlashSquareIcon,
} from 'lucide-react'

import { BotStatus } from '#/components/bot-status'
import { GuildIcon } from '#/components/guild-icon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
  useSidebar,
} from '#/components/ui/sidebar'
import { queries } from '#/lib/api'
import type { GuildSummary } from '#/lib/api-types'
import { useInviteUrl } from '#/lib/use-invite-url'

function GuildSwitcher({
  guilds,
  current,
}: {
  guilds: GuildSummary[]
  current?: GuildSummary
}) {
  const { isMobile } = useSidebar()
  const invite = useInviteUrl()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {current ? (
                <GuildIcon guild={current} />
              ) : (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <LayoutGridIcon aria-hidden className="size-4" />
                </span>
              )}
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold text-sidebar-accent-foreground">
                  {current?.name ?? 'All servers'}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {current
                    ? `${current.memberCount.toLocaleString()} members`
                    : `${guilds.length} ${guilds.length === 1 ? 'server' : 'servers'}`}
                </span>
              </div>
              <ChevronsUpDownIcon aria-hidden className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-60"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link to="/dashboard">
                  <LayoutGridIcon />
                  All servers
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {guilds.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Servers
                  </DropdownMenuLabel>
                  {guilds.map((guild) => (
                    <DropdownMenuItem key={guild.id} asChild>
                      <Link
                        to="/dashboard/$guildId"
                        params={{ guildId: guild.id }}
                      >
                        <GuildIcon guild={guild} className="size-5 rounded-md" />
                        <span className="truncate">{guild.name}</span>
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            ) : null}
            {invite ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <a href={invite} target="_blank" rel="noreferrer">
                      <PlusIcon />
                      Add to another server
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function GuildNav({ guild }: { guild: GuildSummary }) {
  const matchRoute = useMatchRoute()
  const params = { guildId: guild.id }
  const items = [
    { to: '/dashboard/$guildId', label: 'Overview', icon: LayoutDashboardIcon, exact: true },
    { to: '/dashboard/$guildId/commands', label: 'Slash commands', icon: SlashSquareIcon, badge: guild.commandCount },
    { to: '/dashboard/$guildId/responders', label: 'Auto-responders', icon: MessageSquareReplyIcon, badge: guild.responderCount },
    { to: '/dashboard/$guildId/welcome', label: 'Welcome', icon: HandIcon },
    { to: '/dashboard/$guildId/activity', label: 'Activity', icon: ActivityIcon },
  ] as const

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Manage</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton
                asChild
                isActive={
                  !!matchRoute({ to: item.to, params, fuzzy: !('exact' in item) })
                }
                tooltip={item.label}
              >
                <Link to={item.to} params={params}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
              {'badge' in item && item.badge > 0 ? (
                <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
              ) : null}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function ServerList({ guilds }: { guilds: GuildSummary[] }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Servers</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {guilds.map((guild) => (
            <SidebarMenuItem key={guild.id}>
              <SidebarMenuButton asChild tooltip={guild.name}>
                <Link to="/dashboard/$guildId" params={{ guildId: guild.id }}>
                  <GuildIcon guild={guild} className="size-4 rounded-sm" />
                  <span>{guild.name}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function AppSidebar() {
  const { guildId } = useParams({ strict: false })
  const { data: guilds, isPending } = useQuery(queries.guilds())
  const current = guildId ? guilds?.find((g) => g.id === guildId) : undefined

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <GuildSwitcher guilds={guilds ?? []} current={current} />
      </SidebarHeader>
      <SidebarContent>
        {isPending ? (
          <SidebarGroup>
            <SidebarMenu>
              {[0, 1, 2, 3].map((i) => (
                <SidebarMenuItem key={i}>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ) : current ? (
          <GuildNav guild={current} />
        ) : (
          <ServerList guilds={guilds ?? []} />
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2 p-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:p-0">
            <BotStatus />
            <UserButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
