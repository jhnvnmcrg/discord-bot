import {
  infiniteQueryOptions,
  type QueryKey,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { ActivityType } from '#/db/schema'
import type {
  ActivityPage,
  ApiError,
  ApiIssue,
  BotStatusDto,
  ChannelOption,
  CommandDto,
  GuildSummary,
  ResponderDto,
  RoleOption,
  StatsResponse,
  WelcomeDto,
} from './api-types'
import type { CommandInput, ResponderInput, WelcomeInput } from './schemas'

// Browser-side client for the /api REST routes. The dashboard renders with
// ssr: false, so these relative fetches only ever run in the browser.

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: ApiIssue[] = [],
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (response.status === 204) return undefined as T
  const body = (await response.json().catch(() => undefined)) as
    | (T & ApiError)
    | undefined
  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      body?.error ?? `Request failed with status ${response.status}.`,
      body?.issues,
    )
  }
  return body as T
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
})

export const keys = {
  status: ['status'] as const,
  guilds: ['guilds'] as const,
  guild: (guildId: string) => ['guilds', guildId] as const,
  commands: (guildId: string) => ['guilds', guildId, 'commands'] as const,
  responders: (guildId: string) => ['guilds', guildId, 'responders'] as const,
  welcome: (guildId: string) => ['guilds', guildId, 'welcome'] as const,
  activity: (guildId: string) => ['guilds', guildId, 'activity'] as const,
  stats: ['stats'] as const,
}

export const queries = {
  status: () =>
    queryOptions({
      queryKey: keys.status,
      queryFn: () => request<BotStatusDto>('/status'),
      refetchInterval: 30_000,
    }),
  guilds: () =>
    queryOptions({
      queryKey: keys.guilds,
      queryFn: () => request<GuildSummary[]>('/guilds'),
    }),
  guild: (guildId: string) =>
    queryOptions({
      queryKey: keys.guild(guildId),
      queryFn: () => request<GuildSummary>(`/guilds/${guildId}`),
    }),
  channels: (guildId: string) =>
    queryOptions({
      queryKey: [...keys.guild(guildId), 'channels'],
      queryFn: () => request<ChannelOption[]>(`/guilds/${guildId}/channels`),
      staleTime: 60_000,
    }),
  roles: (guildId: string) =>
    queryOptions({
      queryKey: [...keys.guild(guildId), 'roles'],
      queryFn: () => request<RoleOption[]>(`/guilds/${guildId}/roles`),
      staleTime: 60_000,
    }),
  commands: (guildId: string) =>
    queryOptions({
      queryKey: keys.commands(guildId),
      queryFn: () => request<CommandDto[]>(`/guilds/${guildId}/commands`),
    }),
  responders: (guildId: string) =>
    queryOptions({
      queryKey: keys.responders(guildId),
      queryFn: () => request<ResponderDto[]>(`/guilds/${guildId}/responders`),
    }),
  welcome: (guildId: string) =>
    queryOptions({
      queryKey: keys.welcome(guildId),
      queryFn: () => request<WelcomeDto>(`/guilds/${guildId}/welcome`),
    }),
  activity: (guildId: string, type?: ActivityType) =>
    infiniteQueryOptions({
      queryKey: [...keys.activity(guildId), type ?? 'all'],
      queryFn: ({ pageParam }) => {
        const search = new URLSearchParams({ limit: '50' })
        if (type) search.set('type', type)
        if (pageParam) search.set('cursor', String(pageParam))
        return request<ActivityPage>(`/guilds/${guildId}/activity?${search}`)
      },
      initialPageParam: null as number | null,
      getNextPageParam: (page) => page.nextCursor,
    }),
  stats: (guildId?: string, days = 7) =>
    queryOptions({
      queryKey: [...keys.stats, guildId ?? 'all', days],
      queryFn: () => {
        const search = new URLSearchParams({ days: String(days) })
        if (guildId) search.set('guildId', guildId)
        return request<StatsResponse>(`/stats?${search}`)
      },
    }),
}

function useInvalidatingMutation<TVars, TData>(
  mutationFn: (vars: TVars) => Promise<TData>,
  invalidate: QueryKey[],
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all(
        invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  })
}

export function useSaveCommand(guildId: string) {
  return useInvalidatingMutation(
    ({ id, input }: { id?: number; input: CommandInput }) =>
      id
        ? request<CommandDto>(`/guilds/${guildId}/commands/${id}`, send('PATCH', input))
        : request<CommandDto>(`/guilds/${guildId}/commands`, send('POST', input)),
    [keys.commands(guildId), keys.guilds],
  )
}

export function useUpdateCommand(guildId: string) {
  return useInvalidatingMutation(
    ({ id, patch }: { id: number; patch: Partial<CommandInput> }) =>
      request<CommandDto>(`/guilds/${guildId}/commands/${id}`, send('PATCH', patch)),
    [keys.commands(guildId)],
  )
}

export function useDeleteCommand(guildId: string) {
  return useInvalidatingMutation(
    (id: number) =>
      request<void>(`/guilds/${guildId}/commands/${id}`, send('DELETE')),
    [keys.commands(guildId), keys.guilds],
  )
}

export function useSaveResponder(guildId: string) {
  return useInvalidatingMutation(
    ({ id, input }: { id?: number; input: ResponderInput }) =>
      id
        ? request<ResponderDto>(`/guilds/${guildId}/responders/${id}`, send('PATCH', input))
        : request<ResponderDto>(`/guilds/${guildId}/responders`, send('POST', input)),
    [keys.responders(guildId), keys.guilds],
  )
}

export function useUpdateResponder(guildId: string) {
  return useInvalidatingMutation(
    ({ id, patch }: { id: number; patch: Partial<ResponderInput> }) =>
      request<ResponderDto>(`/guilds/${guildId}/responders/${id}`, send('PATCH', patch)),
    [keys.responders(guildId)],
  )
}

export function useDeleteResponder(guildId: string) {
  return useInvalidatingMutation(
    (id: number) =>
      request<void>(`/guilds/${guildId}/responders/${id}`, send('DELETE')),
    [keys.responders(guildId), keys.guilds],
  )
}

export function useSaveWelcome(guildId: string) {
  return useInvalidatingMutation(
    (input: WelcomeInput) =>
      request<WelcomeDto>(`/guilds/${guildId}/welcome`, send('PUT', input)),
    [keys.welcome(guildId), keys.guilds],
  )
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError) {
    return error.issues[0]?.message ?? error.message
  }
  return error instanceof Error ? error.message : 'Something went wrong.'
}
