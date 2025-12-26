import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts'
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
  useClaudeUsage,
  formatBytes,
  formatTimeWindow,
  type TimeWindow,
  type ClaudeFilter,
  type ClaudeInstance,
  type ProcessSortBy,
  type ViboraInstanceGroup,
} from '@/hooks/use-monitoring'
import { useDeveloperMode } from '@/hooks/use-config'

export const Route = createFileRoute('/monitoring/')({
  component: MonitoringPage,
})

const TIME_WINDOWS: TimeWindow[] = ['1m', '10m', '1h', '3h', '6h', '12h', '24h']

const chartConfig: ChartConfig = {
  cpu: {
    label: 'CPU',
    color: 'var(--chart-system)', // Stormy Teal (light) / Cinnabar (dark)
  },
  memoryUsed: {
    label: 'Used',
    color: 'var(--chart-system)', // Stormy Teal (light) / Cinnabar (dark)
  },
  memoryCache: {
    label: 'Cache / Buffers',
    color: 'var(--muted-foreground)', // Lavender Grey
  },
  disk: {
    label: 'Disk',
    color: 'var(--muted-foreground)', // Lavender Grey
  },
}

function ClaudeInstancesTab() {
  const { t } = useTranslation('monitoring')
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
            {t('claude.showAllInstances')}
          </Label>
        </div>

        {instances && (
          <span className="text-sm text-muted-foreground">
            {t('claude.instanceCount', { count: instances.length })}
            {totalRam > 0 && ` · ${t('claude.totalRam', { ram: totalRam.toFixed(0) })}`}
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
          {t('claude.error', { message: error.message })}
        </div>
      )}

      {instances && instances.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          {t('claude.empty')}
          {filter === 'vibora' && t('claude.emptyVibora')}
        </div>
      )}

      {instances && instances.length > 0 && (
        <div className="space-y-2">
          {/* Header - desktop only */}
          <div className="hidden lg:grid grid-cols-[60px_150px_1fr_1fr_80px_80px] gap-4 px-3 py-2 text-xs font-medium text-muted-foreground">
            <span>{t('claude.headers.pid')}</span>
            <span>{t('claude.headers.terminal')}</span>
            <span>{t('claude.headers.task')}</span>
            <span>{t('claude.headers.workingDirectory')}</span>
            <span className="text-right">{t('claude.headers.ram')}</span>
            <span className="text-right">{t('claude.headers.actions')}</span>
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
                        {instance.isViboraManaged ? instance.terminalName : t('claude.source.external')}
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
                    <span>{instance.terminalName || `Terminal ${instance.terminalId?.slice(0, 8)}`}</span>
                  ) : (
                    <span className="text-muted-foreground">{t('claude.source.external')}</span>
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
                    t('claude.noTask')
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
                    {killingPid === instance.pid ? t('claude.killing') : t('claude.kill')}
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
  const { t } = useTranslation('monitoring')
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
          {t('system.error', { message: error.message })}
        </div>
      )}

      {metrics && (
        <div className="space-y-6">
          {/* CPU Chart */}
          <Card className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-medium">{t('system.cpuUsage')}</h3>
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
                  tickFormatter={(value: number) => `${value}%`}
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
              <h3 className="font-medium">{t('system.memoryUsage')}</h3>
              <span className="text-sm text-muted-foreground tabular-nums">
                {formatBytes(metrics.current.memory.used)} {t('system.memoryLabels.used').toLowerCase()} + {formatBytes(metrics.current.memory.cache)} {t('system.memoryLabels.cache').toLowerCase()}
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
                  tickFormatter={(value: number) => `${value}%`}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, name) => {
                        const label = name === 'memoryUsed' ? t('system.memoryLabels.used') : t('system.memoryLabels.cache')
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
              <h3 className="font-medium">{t('system.diskUsage', { path: metrics.current.disk.path })}</h3>
              <span className="text-sm text-muted-foreground tabular-nums">
                {metrics.current.disk.usedPercent.toFixed(1)}% ({formatBytes(metrics.current.disk.used)} /{' '}
                {formatBytes(metrics.current.disk.total)})
              </span>
            </div>
            <div className="h-4 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-chart-system transition-all"
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
  const { t } = useTranslation('monitoring')
  const [sortBy, setSortBy] = useState<ProcessSortBy>('memory')
  const { data: processes, isLoading: processesLoading, error: processesError } = useTopProcesses(sortBy)
  const { data: dockerData, isLoading: dockerLoading } = useDockerStats()

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Top Processes */}
      <Card className="p-4 lg:flex-1 lg:min-w-0 h-[400px] flex flex-col">
        <div className="mb-4 flex items-center justify-between shrink-0">
          <h3 className="font-medium">{t('processes.topProcesses')}</h3>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as ProcessSortBy)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="memory">{t('processes.sortBy.memory')}</SelectItem>
              <SelectItem value="cpu">{t('processes.sortBy.cpu')}</SelectItem>
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
            {t('processes.error', { message: processesError.message })}
          </div>
        )}

        {processes && processes.length > 0 && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="space-y-1">
              <div className="grid grid-cols-[60px_120px_1fr_70px_80px] gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
                <span>{t('processes.headers.pid')}</span>
                <span>{t('processes.headers.name')}</span>
                <span>{t('processes.headers.command')}</span>
                <span className="text-right">{t('processes.headers.memory')}</span>
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
          <div className="flex-1 flex items-center justify-center text-muted-foreground">{t('processes.empty')}</div>
        )}
      </Card>

      {/* Docker Containers */}
      <Card className="p-4 lg:flex-1 lg:min-w-0 h-[400px] flex flex-col">
        <div className="mb-4 flex items-center justify-between shrink-0">
          <h3 className="font-medium">
            {t('processes.containers')}
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
            {t('processes.containersUnavailable')}
          </div>
        )}

        {dockerData && dockerData.available && dockerData.containers.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">{t('processes.containersEmpty')}</div>
        )}

        {dockerData && dockerData.available && dockerData.containers.length > 0 && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="space-y-1">
              <div className="grid grid-cols-[1fr_70px_100px_80px] gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
                <span>{t('processes.headers.name')}</span>
                <span className="text-right">CPU</span>
                <span className="text-right">{t('processes.headers.memory')}</span>
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
  const { t } = useTranslation('monitoring')
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
          {t('vibora.description')}
        </span>
        {instances && instances.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {t('vibora.instanceCount', { count: instances.length })}
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
          {t('vibora.error', { message: error.message })}
        </div>
      )}

      {instances && instances.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          {t('vibora.empty')}
        </div>
      )}

      {instances && instances.length > 0 && (
        <div className="space-y-2">
          {/* Header - desktop only */}
          <div className="hidden lg:grid grid-cols-[80px_100px_1fr_100px_80px] gap-4 px-3 py-2 text-xs font-medium text-muted-foreground">
            <span>{t('vibora.headers.port')}</span>
            <span>{t('vibora.headers.mode')}</span>
            <span>{t('vibora.headers.directory')}</span>
            <span className="text-right">{t('vibora.headers.ram')}</span>
            <span className="text-right">{t('vibora.headers.actions')}</span>
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
                      <span className={`ml-2 text-xs ${group.mode === 'development' ? 'text-muted-foreground' : ''}`}>
                        {group.mode === 'development' ? t('vibora.mode.dev') : t('vibora.mode.prod')}
                        {group.frontend && ` + ${t('vibora.vite')}`}
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
                  <span className={`text-xs ${group.mode === 'development' ? 'text-muted-foreground' : ''}`}>
                    {group.mode === 'development' ? t('vibora.mode.dev') : t('vibora.mode.prod')}
                    {group.frontend && ` + ${t('vibora.vite')}`}
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
                      {isKilling ? t('vibora.killing') : t('vibora.kill')}
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

// Helper to get text color class based on usage percentage
function getUsageTextColor(percent: number): string {
  if (percent >= 90) return 'text-destructive'      // Cinnabar
  if (percent >= 70) return 'text-muted-foreground' // Lavender Grey
  return 'text-chart-system'                        // Stormy Teal (light) / Cinnabar (dark)
}

// Helper to format time remaining
function formatTimeRemaining(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

// Helper to format reset date
function formatResetDate(resetAt: string): string {
  const date = new Date(resetAt)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return `Tomorrow ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Radial gauge component for usage visualization
function UsageGauge({
  percent,
  label,
  subtitle,
  color,
}: {
  percent: number
  label: string
  subtitle: string
  color: string
}) {
  const data = [{ value: Math.min(percent, 100), fill: color }]

  return (
    <Card className="p-4">
      <div className="flex items-center gap-4">
        <div className="relative size-24 shrink-0">
          <RadialBarChart
            width={96}
            height={96}
            cx={48}
            cy={48}
            innerRadius={32}
            outerRadius={44}
            barSize={10}
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              angleAxisId={0}
              tick={false}
            />
            <RadialBar
              background={{ fill: 'var(--border)' }}
              dataKey="value"
              cornerRadius={5}
              angleAxisId={0}
            />
          </RadialBarChart>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-lg font-semibold tabular-nums ${getUsageTextColor(percent)}`}>
              {percent.toFixed(0)}%
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium truncate">{label}</h3>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        </div>
      </div>
    </Card>
  )
}

function ClaudeUsageLimitsTab() {
  const { t } = useTranslation('monitoring')
  const { data: usage, isLoading, error } = useClaudeUsage()

  // Get color based on usage level
  const getGaugeColor = (percent: number): string => {
    if (percent >= 90) return 'var(--destructive)'      // Cinnabar
    if (percent >= 70) return 'var(--muted-foreground)' // Lavender Grey
    return 'var(--chart-system)'                        // Stormy Teal (light) / Cinnabar (dark)
  }

  return (
    <div className="space-y-4">
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <HugeiconsIcon icon={Loading03Icon} className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {t('usage.error', { message: error.message })}
        </div>
      )}

      {usage && !usage.available && (
        <div className="rounded-lg border border-muted-foreground/50 bg-muted p-4 text-sm text-muted-foreground">
          {usage.error || t('usage.unavailable')}
        </div>
      )}

      {usage && usage.available && (
        <div className="space-y-3">
          {/* Main usage gauges */}
          <div className="grid gap-3 sm:grid-cols-2">
            {/* 5-Hour Block */}
            {usage.fiveHour && (
              <UsageGauge
                percent={usage.fiveHour.percentUsed}
                label={t('usage.fiveHourBlock')}
                subtitle={t('usage.resetsIn', { time: formatTimeRemaining(usage.fiveHour.timeRemainingMinutes) })}
                color={getGaugeColor(usage.fiveHour.percentUsed)}
              />
            )}

            {/* 7-Day Rolling */}
            {usage.sevenDay && (
              <UsageGauge
                percent={usage.sevenDay.percentUsed}
                label={t('usage.sevenDayRolling')}
                subtitle={`${t('usage.resetsAt', { time: formatResetDate(usage.sevenDay.resetAt) })} · ${t('usage.weekProgress', { percent: usage.sevenDay.weekProgressPercent })}`}
                color={getGaugeColor(usage.sevenDay.percentUsed)}
              />
            )}
          </div>

          {/* Model-specific limits (Opus/Sonnet) */}
          {(usage.sevenDayOpus || usage.sevenDaySonnet) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {usage.sevenDayOpus && (
                <UsageGauge
                  percent={usage.sevenDayOpus.percentUsed}
                  label={t('usage.opusWeekly')}
                  subtitle={t('usage.resetsAt', { time: formatResetDate(usage.sevenDayOpus.resetAt) })}
                  color={getGaugeColor(usage.sevenDayOpus.percentUsed)}
                />
              )}

              {usage.sevenDaySonnet && (
                <UsageGauge
                  percent={usage.sevenDaySonnet.percentUsed}
                  label={t('usage.sonnetWeekly')}
                  subtitle={t('usage.resetsAt', { time: formatResetDate(usage.sevenDaySonnet.resetAt) })}
                  color={getGaugeColor(usage.sevenDaySonnet.percentUsed)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type MonitoringTab = 'system' | 'processes' | 'claude' | 'vibora' | 'usage'

function MonitoringPage() {
  const { t } = useTranslation('monitoring')
  const { data: developerMode } = useDeveloperMode()
  const [activeTab, setActiveTab] = useState<MonitoringTab>('system')

  const tabs: { value: MonitoringTab; label: string; devOnly?: boolean }[] = [
    { value: 'system', label: t('tabs.system') },
    { value: 'processes', label: t('tabs.processes') },
    { value: 'claude', label: t('tabs.claude') },
    { value: 'vibora', label: t('tabs.vibora'), devOnly: true },
    { value: 'usage', label: t('tabs.usage') },
  ]

  const visibleTabs = tabs.filter(tab => !tab.devOnly || developerMode?.enabled)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-background px-4 py-2">
        <h1 className="text-sm font-medium">{t('title')}</h1>

        {/* Mobile: dropdown */}
        <div className="sm:hidden">
          <Select value={activeTab} onValueChange={(v) => setActiveTab(v as MonitoringTab)}>
            <SelectTrigger size="sm" className="w-auto gap-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {visibleTabs.map(tab => (
                <SelectItem key={tab.value} value={tab.value}>{tab.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Desktop: tabs */}
        <div className="hidden sm:block">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as MonitoringTab)}>
            <TabsList>
              {visibleTabs.map(tab => (
                <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'system' && <SystemMetricsTab />}
        {activeTab === 'processes' && <ProcessesTab />}
        {activeTab === 'claude' && <ClaudeInstancesTab />}
        {activeTab === 'vibora' && developerMode?.enabled && <ViboraInstancesTab />}
        {activeTab === 'usage' && <ClaudeUsageLimitsTab />}
      </div>
    </div>
  )
}
