import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Area, AreaChart, XAxis, YAxis, CartesianGrid } from 'recharts'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, Loading03Icon } from '@hugeicons/core-free-icons'
import {
  useClaudeInstances,
  useSystemMetrics,
  useKillClaudeInstance,
  useTopProcesses,
  useDockerStats,
  useViboraInstances,
  useKillViboraInstance,
  formatBytes,
  formatTimeWindow,
  type TimeWindow,
  type ClaudeFilter,
  type ClaudeInstance,
  type ProcessSortBy,
  type ViboraInstanceGroup,
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
  memoryUsed: {
    label: 'Used',
    color: '#22c55e', // Green (darker)
  },
  memoryCache: {
    label: 'Cache / Buffers',
    color: 'hsl(160 60% 45%)', // Lighter green (matches Beszel)
  },
  disk: {
    label: 'Disk',
    color: '#f59e0b', // Amber
  },
}

function ClaudeInstancesTab() {
  const [filter, setFilter] = useState<ClaudeFilter>('vibora')
  const [killingPid, setKillingPid] = useState<number | null>(null)
  const { data: instances, isLoading, error } = useClaudeInstances(filter)
  const killInstance = useKillClaudeInstance()

  const totalRam = instances?.reduce((sum, i) => sum + i.ramMB, 0) || 0

  const handleKill = (instance: ClaudeInstance) => {
    setKillingPid(instance.pid)
    const payload = instance.isViboraManaged && instance.terminalId
      ? { terminalId: instance.terminalId }
      : { pid: instance.pid }
    killInstance.mutate(payload, {
      onSettled: () => setKillingPid(null),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            id="show-all"
            checked={filter === 'all'}
            onCheckedChange={(checked) => setFilter(checked ? 'all' : 'vibora')}
          />
          <Label htmlFor="show-all" className="text-sm text-muted-foreground">
            Show all instances
          </Label>
        </div>

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
          {/* Header - desktop only */}
          <div className="hidden lg:grid grid-cols-[60px_150px_1fr_1fr_80px_80px] gap-4 px-3 py-2 text-xs font-medium text-muted-foreground">
            <span>PID</span>
            <span>Terminal</span>
            <span>Task</span>
            <span>Working Dir</span>
            <span className="text-right">RAM</span>
            <span className="text-right">Actions</span>
          </div>

          {instances.map((instance) => (
            <Card key={instance.pid} className="px-3 py-2">
              {/* Mobile: stacked layout */}
              <div className="flex flex-col gap-1 lg:hidden">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">
                    {instance.taskId ? (
                      <Link
                        to="/tasks/$taskId"
                        params={{ taskId: instance.taskId }}
                        className="hover:text-foreground hover:underline"
                      >
                        {instance.taskTitle}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">
                        {instance.isViboraManaged ? instance.terminalName : 'External'}
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="tabular-nums text-sm text-muted-foreground">{instance.ramMB.toFixed(0)} MB</span>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleKill(instance)}
                      disabled={killingPid === instance.pid}
                      className={`text-destructive hover:text-destructive hover:bg-destructive/10 ${killingPid === instance.pid ? 'opacity-50' : ''}`}
                    >
                      <HugeiconsIcon icon={killingPid === instance.pid ? Loading03Icon : Cancel01Icon} className={`size-3.5 ${killingPid === instance.pid ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground truncate" title={instance.cwd}>
                  {instance.cwd}
                </span>
              </div>

              {/* Desktop: grid layout */}
              <div className="hidden lg:grid grid-cols-[60px_150px_1fr_1fr_80px_80px] items-center gap-4">
                <span className="font-mono text-xs">{instance.pid}</span>
                <span className="truncate text-sm">
                  {instance.isViboraManaged ? (
                    <span className="text-blue-500">{instance.terminalName || `Terminal ${instance.terminalId?.slice(0, 8)}`}</span>
                  ) : (
                    <span className="text-muted-foreground">External</span>
                  )}
                </span>
                <span className="text-muted-foreground truncate text-sm">
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
                <span className="text-muted-foreground truncate text-sm" title={instance.cwd}>
                  {instance.cwd}
                </span>
                <span className="text-right tabular-nums text-sm">{instance.ramMB.toFixed(0)} MB</span>
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleKill(instance)}
                    disabled={killingPid === instance.pid}
                    className={`text-destructive hover:text-destructive hover:bg-destructive/10 ${killingPid === instance.pid ? 'opacity-50' : ''}`}
                  >
                    <HugeiconsIcon icon={killingPid === instance.pid ? Loading03Icon : Cancel01Icon} className={`size-3.5 ${killingPid === instance.pid ? 'animate-spin' : ''}`} />
                    {killingPid === instance.pid ? 'Killing...' : 'Kill'}
                  </Button>
                </div>
              </div>
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
      memoryUsed: Math.round(point.memoryUsedPercent * 10) / 10,
      memoryCache: Math.round(point.memoryCachePercent * 10) / 10,
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
                  content={<ChartTooltipContent hideLabel formatter={(value) => [`${value}% `, 'CPU']} />}
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
                {formatBytes(metrics.current.memory.used)} used + {formatBytes(metrics.current.memory.cache)} cache
                {' / '}{formatBytes(metrics.current.memory.total)}
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
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, name) => {
                        const label = name === 'memoryUsed' ? 'Used' : 'Cache / Buffers'
                        return [`${value}% `, label]
                      }}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="memoryUsed"
                  stroke="var(--color-memoryUsed)"
                  fill="var(--color-memoryUsed)"
                  fillOpacity={0.5}
                  strokeWidth={2}
                  stackId="memory"
                />
                <Area
                  type="monotone"
                  dataKey="memoryCache"
                  stroke="var(--color-memoryCache)"
                  fill="var(--color-memoryCache)"
                  fillOpacity={0.4}
                  strokeWidth={1}
                  stackId="memory"
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

function ProcessesTab() {
  const [sortBy, setSortBy] = useState<ProcessSortBy>('memory')
  const { data: processes, isLoading: processesLoading, error: processesError } = useTopProcesses(sortBy)
  const { data: dockerData, isLoading: dockerLoading } = useDockerStats()

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Top Processes */}
      <Card className="p-4 lg:flex-1 lg:min-w-0 h-[400px] flex flex-col">
        <div className="mb-4 flex items-center justify-between shrink-0">
          <h3 className="font-medium">Top Processes</h3>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as ProcessSortBy)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="memory">By Memory</SelectItem>
              <SelectItem value="cpu">By CPU</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {processesLoading && (
          <div className="flex items-center justify-center flex-1">
            <HugeiconsIcon icon={Loading03Icon} className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {processesError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load processes: {processesError.message}
          </div>
        )}

        {processes && processes.length > 0 && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="space-y-1">
              <div className="grid grid-cols-[60px_120px_1fr_70px_80px] gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
                <span>PID</span>
                <span>Name</span>
                <span>Command</span>
                <span className="text-right">Memory</span>
                <span className="text-right">%</span>
              </div>
              {processes.map((proc) => (
                <div
                  key={proc.pid}
                  className="grid grid-cols-[60px_120px_1fr_70px_80px] gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
                >
                  <span className="font-mono text-xs text-muted-foreground">{proc.pid}</span>
                  <span className="truncate font-medium" title={proc.name}>
                    {proc.name}
                  </span>
                  <span className="truncate text-muted-foreground text-xs" title={proc.command}>
                    {proc.command}
                  </span>
                  <span className="text-right tabular-nums">{proc.memoryMB.toFixed(0)} MB</span>
                  <span className="text-right tabular-nums text-muted-foreground">{proc.memoryPercent.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {processes && processes.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">No processes found</div>
        )}
      </Card>

      {/* Docker Containers */}
      <Card className="p-4 lg:flex-1 lg:min-w-0 h-[400px] flex flex-col">
        <div className="mb-4 flex items-center justify-between shrink-0">
          <h3 className="font-medium">
            Containers
            {dockerData?.runtime && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">({dockerData.runtime})</span>
            )}
          </h3>
        </div>

        {dockerLoading && (
          <div className="flex items-center justify-center flex-1">
            <HugeiconsIcon icon={Loading03Icon} className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {dockerData && !dockerData.available && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Docker/Podman not available
          </div>
        )}

        {dockerData && dockerData.available && dockerData.containers.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">No containers running</div>
        )}

        {dockerData && dockerData.available && dockerData.containers.length > 0 && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="space-y-1">
              <div className="grid grid-cols-[1fr_70px_100px_80px] gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
                <span>Name</span>
                <span className="text-right">CPU</span>
                <span className="text-right">Memory</span>
                <span className="text-right">%</span>
              </div>
              {dockerData.containers.map((container) => (
                <div
                  key={container.id}
                  className="grid grid-cols-[1fr_70px_100px_80px] gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
                >
                  <span className="truncate font-medium" title={container.name}>
                    {container.name}
                  </span>
                  <span className="text-right tabular-nums">{container.cpuPercent.toFixed(1)}%</span>
                  <span className="text-right tabular-nums">
                    {container.memoryMB.toFixed(0)} / {container.memoryLimit.toFixed(0)} MB
                  </span>
                  <span className="text-right tabular-nums text-muted-foreground">{container.memoryPercent.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function ViboraInstancesTab() {
  const [killingPid, setKillingPid] = useState<number | null>(null)
  const { data: instances, isLoading, error } = useViboraInstances()
  const killInstance = useKillViboraInstance()

  const handleKill = (group: ViboraInstanceGroup) => {
    if (!group.backend) return
    setKillingPid(group.backend.pid)
    killInstance.mutate(
      { backendPid: group.backend.pid },
      { onSettled: () => setKillingPid(null) }
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Running Vibora dev servers
        </span>
        {instances && instances.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {instances.length} instance{instances.length !== 1 ? 's' : ''} running
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
          Failed to load Vibora instances: {error.message}
        </div>
      )}

      {instances && instances.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          No Vibora instances running
        </div>
      )}

      {instances && instances.length > 0 && (
        <div className="space-y-2">
          {/* Header - desktop only */}
          <div className="hidden lg:grid grid-cols-[80px_100px_1fr_100px_80px] gap-4 px-3 py-2 text-xs font-medium text-muted-foreground">
            <span>Port</span>
            <span>Mode</span>
            <span>Directory</span>
            <span className="text-right">RAM</span>
            <span className="text-right">Actions</span>
          </div>

          {instances.map((group) => {
            const isKilling = killingPid === group.backend?.pid
            return (
              <Card key={group.backend?.pid || group.port} className="px-3 py-2">
                {/* Mobile: stacked layout */}
                <div className="flex flex-col gap-1 lg:hidden">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      <span className="font-mono">:{group.port}</span>
                      <span className={`ml-2 text-xs ${group.mode === 'development' ? 'text-yellow-500' : 'text-green-500'}`}>
                        {group.mode === 'development' ? 'Dev' : 'Prod'}
                        {group.frontend && ' + Vite'}
                      </span>
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="tabular-nums text-sm text-muted-foreground">{group.totalMemoryMB.toFixed(0)} MB</span>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleKill(group)}
                        disabled={isKilling || !group.backend}
                        className={`text-destructive hover:text-destructive hover:bg-destructive/10 ${isKilling ? 'opacity-50' : ''}`}
                      >
                        <HugeiconsIcon icon={isKilling ? Loading03Icon : Cancel01Icon} className={`size-3.5 ${isKilling ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground truncate" title={group.viboraDir}>
                    {group.viboraDir}
                  </span>
                </div>

                {/* Desktop: grid layout */}
                <div className="hidden lg:grid grid-cols-[80px_100px_1fr_100px_80px] items-center gap-4">
                  <span className="font-mono text-sm">{group.port}</span>
                  <span className={`text-xs ${group.mode === 'development' ? 'text-yellow-500' : 'text-green-500'}`}>
                    {group.mode === 'development' ? 'Dev' : 'Prod'}
                    {group.frontend && ' + Vite'}
                  </span>
                  <span className="text-muted-foreground truncate text-sm" title={group.viboraDir}>
                    {group.viboraDir}
                  </span>
                  <span className="text-right tabular-nums text-sm">
                    {group.totalMemoryMB.toFixed(0)} MB
                  </span>
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleKill(group)}
                      disabled={isKilling || !group.backend}
                      className={`text-destructive hover:text-destructive hover:bg-destructive/10 ${isKilling ? 'opacity-50' : ''}`}
                    >
                      <HugeiconsIcon icon={isKilling ? Loading03Icon : Cancel01Icon} className={`size-3.5 ${isKilling ? 'animate-spin' : ''}`} />
                      {isKilling ? 'Killing...' : 'Kill'}
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MonitoringPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <h1 className="mb-4 text-lg font-semibold">Monitoring</h1>

      <Tabs defaultValue="system" className="flex-1 flex flex-col min-h-0">
        <div className="overflow-x-auto shrink-0">
          <TabsList className="inline-flex w-auto">
            <TabsTrigger value="system">System Metrics</TabsTrigger>
            <TabsTrigger value="processes">Processes</TabsTrigger>
            <TabsTrigger value="claude">Claude Instances</TabsTrigger>
            <TabsTrigger value="vibora">Vibora Servers</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="system" className="flex-1 overflow-auto pt-4">
          <SystemMetricsTab />
        </TabsContent>

        <TabsContent value="processes" className="flex-1 overflow-auto pt-4">
          <ProcessesTab />
        </TabsContent>

        <TabsContent value="claude" className="flex-1 overflow-auto pt-4">
          <ClaudeInstancesTab />
        </TabsContent>

        <TabsContent value="vibora" className="flex-1 overflow-auto pt-4">
          <ViboraInstancesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
