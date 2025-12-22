import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Area, AreaChart, XAxis, YAxis, CartesianGrid } from 'recharts'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, Loading03Icon } from '@hugeicons/core-free-icons'
import {
  useClaudeInstances,
  useSystemMetrics,
  useKillClaudeInstance,
  formatBytes,
  formatTimeWindow,
  type TimeWindow,
  type ClaudeFilter,
} from '@/hooks/use-monitoring'

export const Route = createFileRoute('/monitoring/')({
  component: MonitoringPage,
})

const TIME_WINDOWS: TimeWindow[] = ['1m', '10m', '1h', '3h', '6h', '12h', '24h']

const chartConfig: ChartConfig = {
  cpu: {
    label: 'CPU',
    color: '#22c55e', // Green
  },
  memory: {
    label: 'Memory',
    color: '#3b82f6', // Blue
  },
  disk: {
    label: 'Disk',
    color: '#f59e0b', // Amber
  },
}

function ClaudeInstancesTab() {
  const [filter, setFilter] = useState<ClaudeFilter>('vibora')
  const { data: instances, isLoading, error } = useClaudeInstances(filter)
  const killInstance = useKillClaudeInstance()

  const totalRam = instances?.reduce((sum, i) => sum + i.ramMB, 0) || 0

  const handleKill = (instance: typeof instances extends (infer T)[] ? T : never) => {
    if (instance.isViboraManaged && instance.terminalId) {
      killInstance.mutate({ terminalId: instance.terminalId })
    } else {
      killInstance.mutate({ pid: instance.pid })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Select value={filter} onValueChange={(value) => setFilter(value as ClaudeFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vibora">Vibora only</SelectItem>
            <SelectItem value="all">All instances</SelectItem>
          </SelectContent>
        </Select>

        {instances && (
          <span className="text-sm text-muted-foreground">
            {instances.length} instance{instances.length !== 1 ? 's' : ''} running
            {totalRam > 0 && ` · ${totalRam.toFixed(0)} MB total`}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <HugeiconsIcon icon={Loading03Icon} className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load Claude instances: {error.message}
        </div>
      )}

      {instances && instances.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          No Claude instances running
          {filter === 'vibora' && ' in Vibora terminals'}
        </div>
      )}

      {instances && instances.length > 0 && (
        <div className="space-y-2">
          {filter === 'vibora' ? (
            // Vibora-managed view: Terminal, Task, RAM, Actions
            <div className="grid grid-cols-[1fr_1fr_80px_80px] gap-4 px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>Terminal</span>
              <span>Task</span>
              <span className="text-right">RAM</span>
              <span className="text-right">Actions</span>
            </div>
          ) : (
            // All instances view: PID, Working Directory, RAM, Source, Actions
            <div className="grid grid-cols-[60px_1fr_80px_120px_80px] gap-4 px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>PID</span>
              <span>Working Directory</span>
              <span className="text-right">RAM</span>
              <span>Source</span>
              <span className="text-right">Actions</span>
            </div>
          )}

          {instances.map((instance) => (
            <Card key={instance.pid} className="px-3 py-2">
              {filter === 'vibora' ? (
                <div className="grid grid-cols-[1fr_1fr_80px_80px] items-center gap-4">
                  <span className="font-medium truncate">
                    {instance.terminalName || `Terminal ${instance.terminalId?.slice(0, 8)}`}
                  </span>
                  <span className="text-muted-foreground truncate">
                    {instance.taskId ? (
                      <Link
                        to="/tasks/$taskId"
                        params={{ taskId: instance.taskId }}
                        className="hover:text-foreground hover:underline"
                      >
                        {instance.taskTitle}
                      </Link>
                    ) : (
                      '(no task)'
                    )}
                  </span>
                  <span className="text-right tabular-nums">{instance.ramMB.toFixed(0)} MB</span>
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleKill(instance)}
                      disabled={killInstance.isPending}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                      Kill
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-[60px_1fr_80px_120px_80px] items-center gap-4">
                  <span className="font-mono text-xs">{instance.pid}</span>
                  <span className="text-muted-foreground truncate" title={instance.cwd}>
                    {instance.cwd}
                  </span>
                  <span className="text-right tabular-nums">{instance.ramMB.toFixed(0)} MB</span>
                  <span className="text-xs">
                    {instance.isViboraManaged ? (
                      <span className="text-blue-500">Vibora: {instance.terminalName}</span>
                    ) : (
                      <span className="text-muted-foreground">External</span>
                    )}
                  </span>
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleKill(instance)}
                      disabled={killInstance.isPending}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                      Kill
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function SystemMetricsTab() {
  const [window, setWindow] = useState<TimeWindow>('1h')
  const { data: metrics, isLoading, error } = useSystemMetrics(window)

  // Transform data for charts - use timestamp as x-axis
  const chartData =
    metrics?.dataPoints.map((point) => ({
      time: new Date(point.timestamp * 1000).toLocaleTimeString(),
      timestamp: point.timestamp,
      cpu: Math.round(point.cpuPercent * 10) / 10,
      memory: Math.round(point.memoryUsedPercent * 10) / 10,
    })) || []

  return (
    <div className="space-y-6">
      {/* Time window selector */}
      <div className="flex gap-1">
        {TIME_WINDOWS.map((tw) => (
          <Button
            key={tw}
            variant={window === tw ? 'secondary' : 'ghost'}
            size="xs"
            onClick={() => setWindow(tw)}
          >
            {formatTimeWindow(tw)}
          </Button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <HugeiconsIcon icon={Loading03Icon} className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load system metrics: {error.message}
        </div>
      )}

      {metrics && (
        <div className="space-y-6">
          {/* CPU Chart */}
          <Card className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-medium">CPU Usage</h3>
              <span className="text-sm text-muted-foreground tabular-nums">
                {metrics.current.cpu.toFixed(1)}%
              </span>
            </div>
            <ChartContainer config={chartConfig} className="h-[150px] w-full">
              <AreaChart data={chartData} margin={{ left: 0, right: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="time"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={40}
                />
                <YAxis
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(value) => `${value}%`}
                />
                <ChartTooltip
                  content={<ChartTooltipContent hideLabel formatter={(value) => [`${value}%`, 'CPU']} />}
                />
                <Area
                  type="monotone"
                  dataKey="cpu"
                  stroke="var(--color-cpu)"
                  fill="var(--color-cpu)"
                  fillOpacity={0.4}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </Card>

          {/* Memory Chart */}
          <Card className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-medium">Memory Usage</h3>
              <span className="text-sm text-muted-foreground tabular-nums">
                {metrics.current.memory.usedPercent.toFixed(1)}% ({formatBytes(metrics.current.memory.used)}{' '}
                / {formatBytes(metrics.current.memory.total)})
              </span>
            </div>
            <ChartContainer config={chartConfig} className="h-[150px] w-full">
              <AreaChart data={chartData} margin={{ left: 0, right: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="time"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={40}
                />
                <YAxis
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(value) => `${value}%`}
                />
                <ChartTooltip
                  content={<ChartTooltipContent hideLabel formatter={(value) => [`${value}%`, 'Memory']} />}
                />
                <Area
                  type="monotone"
                  dataKey="memory"
                  stroke="var(--color-memory)"
                  fill="var(--color-memory)"
                  fillOpacity={0.4}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </Card>

          {/* Disk Usage */}
          <Card className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-medium">Disk Usage ({metrics.current.disk.path})</h3>
              <span className="text-sm text-muted-foreground tabular-nums">
                {metrics.current.disk.usedPercent.toFixed(1)}% ({formatBytes(metrics.current.disk.used)} /{' '}
                {formatBytes(metrics.current.disk.total)})
              </span>
            </div>
            <div className="h-4 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${Math.min(metrics.current.disk.usedPercent, 100)}%` }}
              />
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function MonitoringPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <h1 className="mb-4 text-lg font-semibold">Monitoring</h1>

      <Tabs defaultValue="claude" className="flex-1 flex flex-col min-h-0">
        <TabsList>
          <TabsTrigger value="claude">Claude Instances</TabsTrigger>
          <TabsTrigger value="system">System Metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="claude" className="flex-1 overflow-auto pt-4">
          <ClaudeInstancesTab />
        </TabsContent>

        <TabsContent value="system" className="flex-1 overflow-auto pt-4">
          <SystemMetricsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
