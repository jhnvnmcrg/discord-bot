import { useQuery } from '@tanstack/react-query'
import { AlertTriangleIcon } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '#/components/ui/chart'
import { Skeleton } from '#/components/ui/skeleton'
import { queries } from '#/lib/api'
import type { StatsResponse } from '#/lib/api-types'

// Series order is fixed (and validated for colour-blind separation when
// stacked in this order); errors are a status, not a series, so they get a tile.
const chartConfig = {
  command: { label: 'Commands', color: 'var(--chart-1)' },
  autoresponse: { label: 'Auto-replies', color: 'var(--chart-2)' },
  member_join: { label: 'Joins', color: 'var(--chart-3)' },
  member_leave: { label: 'Leaves', color: 'var(--chart-4)' },
} satisfies ChartConfig

const SERIES = Object.keys(chartConfig) as (keyof typeof chartConfig)[]

function dayLabel(date: string, style: 'short' | 'long' = 'short') {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: style,
    day: style === 'long' ? 'numeric' : undefined,
    month: style === 'long' ? 'long' : undefined,
    timeZone: 'UTC',
  })
}

function StatTile({
  label,
  value,
  alert,
}: {
  label: string
  value?: number
  alert?: boolean
}) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardDescription className="flex items-center gap-1.5">
          {alert ? (
            <AlertTriangleIcon aria-hidden className="size-3.5 text-destructive" />
          ) : null}
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        {value === undefined ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <span className="text-3xl font-bold tabular-nums text-white">
            {value.toLocaleString()}
          </span>
        )}
      </CardContent>
    </Card>
  )
}

export function StatTiles({ totals }: { totals?: StatsResponse['totals'] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Commands used" value={totals?.command} />
      <StatTile label="Auto-replies sent" value={totals?.autoresponse} />
      <StatTile label="Members joined" value={totals?.member_join} />
      <StatTile
        label="Errors"
        value={totals?.error}
        alert={!!totals && totals.error > 0}
      />
    </div>
  )
}

export function ActivityChart({ stats }: { stats?: StatsResponse }) {
  const empty = stats?.days.every((day) => SERIES.every((key) => day[key] === 0))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>Events per day over the last 7 days (UTC)</CardDescription>
      </CardHeader>
      <CardContent>
        {!stats ? (
          <Skeleton className="aspect-[3/1] w-full" />
        ) : empty ? (
          <div className="flex aspect-[3/1] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            Nothing yet. Events appear here once people use the bot.
          </div>
        ) : (
          <>
            <ChartContainer config={chartConfig} className="aspect-[3/1] min-h-48 w-full">
              <BarChart data={stats.days} barCategoryGap="30%" accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(date: string) => dayLabel(date)}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <ChartTooltip
                  cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) =>
                        payload[0] ? dayLabel(payload[0].payload.date, 'long') : ''
                      }
                    />
                  }
                />
                {/* Keep legend order = stack order (bottom segment first), not alphabetical. */}
                <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
                {SERIES.map((key, index) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="events"
                    fill={`var(--color-${key})`}
                    // 2px surface-coloured gap between stacked segments.
                    stroke="var(--card)"
                    strokeWidth={2}
                    radius={index === SERIES.length - 1 ? [4, 4, 0, 0] : 0}
                  />
                ))}
              </BarChart>
            </ChartContainer>
            <table className="sr-only">
              <caption>Events per day</caption>
              <thead>
                <tr>
                  <th>Day</th>
                  {SERIES.map((key) => (
                    <th key={key}>{chartConfig[key].label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.days.map((day) => (
                  <tr key={day.date}>
                    <td>{dayLabel(day.date, 'long')}</td>
                    {SERIES.map((key) => (
                      <td key={key}>{day[key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function useStats(guildId?: string) {
  return useQuery(queries.stats(guildId)).data
}
