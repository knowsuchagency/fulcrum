import { useState, useMemo, useEffect, useCallback } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  Loading03Icon,
  Delete02Icon,
  GitBranchIcon,
  Folder01Icon,
  Calendar03Icon,
  HardDriveIcon,
  ArrowRight01Icon,
  CleanIcon,
} from '@hugeicons/core-free-icons'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useWorktrees, useDeleteWorktree } from '@/hooks/use-worktrees'
import { cn } from '@/lib/utils'
import type { Worktree, TaskStatus } from '@/types'
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
import { desktopZoom } from '@/main'

type MonitoringTab = 'system' | 'processes' | 'claude' | 'vibora' | 'worktrees' | 'usage'

const VALID_TABS: MonitoringTab[] = ['system', 'processes', 'claude', 'vibora', 'worktrees', 'usage']

export const Route = createFileRoute('/monitoring/')({
  component: MonitoringPage,
  validateSearch: (search: Record<string, unknown>): { tab?: MonitoringTab } => ({
    tab: VALID_TABS.includes(search.tab as MonitoringTab) ? (search.tab as MonitoringTab) : undefined,
  }),
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
  const [selectedPids, setSelectedPids] = useState<Set<number>>(new Set())
  const [isKillingSelected, setIsKillingSelected] = useState(false)
  const { data: instances, isLoading, error } = useClaudeInstances(filter)
  const killInstance = useKillClaudeInstance()

  const totalRam = instances?.reduce((sum, i) => sum + i.ramMB, 0) || 0
  const isAnyKilling = killingPid !== null || isKillingSelected

  // Clear killingPid when the instance is no longer in the list
  useEffect(() => {
    if (killingPid !== null && instances && !instances.some((i) => i.pid === killingPid)) {
      setKillingPid(null)
    }
  }, [killingPid, instances])

  // Clear selected PIDs that no longer exist
  useEffect(() => {
    if (selectedPids.size > 0 && instances) {
      const stillExists = new Set([...selectedPids].filter(pid => instances.some(i => i.pid === pid)))
      if (stillExists.size !== selectedPids.size) {
        setSelectedPids(stillExists)
      }
    }
  }, [selectedPids, instances])

  const handleKill = (instance: ClaudeInstance) => {
    setKillingPid(instance.pid)
    const payload = instance.isViboraManaged && instance.terminalId
      ? { terminalId: instance.terminalId }
      : { pid: instance.pid }
    killInstance.mutate(payload, {
      onError: () => setKillingPid(null),
    })
  }

  const toggleSelection = (pid: number) => {
    setSelectedPids(prev => {
      const next = new Set(prev)
      if (next.has(pid)) {
        next.delete(pid)
      } else {
        next.add(pid)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (!instances) return
    if (selectedPids.size === instances.length) {
      setSelectedPids(new Set())
    } else {
      setSelectedPids(new Set(instances.map(i => i.pid)))
    }
  }

  const handleKillSelected = async () => {
    if (!instances || selectedPids.size === 0) return
    setIsKillingSelected(true)

    const toKill = instances.filter(i => selectedPids.has(i.pid))
    for (const instance of toKill) {
      const payload = instance.isViboraManaged && instance.terminalId
        ? { terminalId: instance.terminalId }
        : { pid: instance.pid }
      try {
        await killInstance.mutateAsync(payload)
      } catch {
        // Continue killing others even if one fails
      }
    }

    setSelectedPids(new Set())
    setIsKillingSelected(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
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

          {selectedPids.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleKillSelected}
              disabled={isAnyKilling}
              className="gap-1.5"
            >
              {isKillingSelected ? (
                <HugeiconsIcon icon={Loading03Icon} className="size-3.5 animate-spin" />
              ) : (
                <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
              )}
              {t('claude.killSelected', { count: selectedPids.size })}
            </Button>
          )}
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
          <div className="hidden lg:grid grid-cols-[32px_60px_150px_1fr_1fr_80px_80px] gap-4 px-3 py-2 text-xs font-medium text-muted-foreground">
            <div className="flex items-center justify-center">
              <Checkbox
                checked={selectedPids.size === instances.length}
                onCheckedChange={toggleSelectAll}
                disabled={isAnyKilling}
              />
            </div>
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
                  <div className="flex items-center gap-2 min-w-0">
                    <Checkbox
                      checked={selectedPids.has(instance.pid)}
                      onCheckedChange={() => toggleSelection(instance.pid)}
                      disabled={isAnyKilling}
                      className="shrink-0"
                    />
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
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="tabular-nums text-sm text-muted-foreground">{instance.ramMB.toFixed(0)} MB</span>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleKill(instance)}
                      disabled={isAnyKilling}
                      className={`text-destructive hover:text-destructive hover:bg-destructive/10 ${isAnyKilling ? 'opacity-50' : ''}`}
                    >
                      <HugeiconsIcon icon={killingPid === instance.pid ? Loading03Icon : Cancel01Icon} className={`size-3.5 ${killingPid === instance.pid ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground truncate pl-6" title={instance.cwd}>
                  {instance.cwd}
                </span>
              </div>

              {/* Desktop: grid layout */}
              <div className="hidden lg:grid grid-cols-[32px_60px_150px_1fr_1fr_80px_80px] items-center gap-4">
                <div className="flex items-center justify-center">
                  <Checkbox
                    checked={selectedPids.has(instance.pid)}
                    onCheckedChange={() => toggleSelection(instance.pid)}
                    disabled={isAnyKilling}
                  />
                </div>
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
                    disabled={isAnyKilling}
                    className={`text-destructive hover:text-destructive hover:bg-destructive/10 ${isAnyKilling ? 'opacity-50' : ''}`}
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
      {/* Mobile: dropdown */}
      <div className="sm:hidden">
        <Select value={window} onValueChange={(v) => setWindow(v as TimeWindow)}>
          <SelectTrigger size="sm" className="w-auto gap-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_WINDOWS.map((tw) => (
              <SelectItem key={tw} value={tw}>{formatTimeWindow(tw)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* Desktop: buttons */}
      <div className="hidden sm:flex gap-1">
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

  // Clear killingPid when the instance is no longer in the list
  useEffect(() => {
    if (killingPid !== null && instances && !instances.some((g) => g.backend?.pid === killingPid)) {
      setKillingPid(null)
    }
  }, [killingPid, instances])

  const handleKill = (group: ViboraInstanceGroup) => {
    if (!group.backend) return
    setKillingPid(group.backend.pid)
    killInstance.mutate(
      { backendPid: group.backend.pid },
      { onError: () => setKillingPid(null) }
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
            const isAnyKilling = killingPid !== null
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
                        disabled={isAnyKilling || !group.backend}
                        className={`text-destructive hover:text-destructive hover:bg-destructive/10 ${isAnyKilling ? 'opacity-50' : ''}`}
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
                      disabled={isAnyKilling || !group.backend}
                      className={`text-destructive hover:text-destructive hover:bg-destructive/10 ${isAnyKilling ? 'opacity-50' : ''}`}
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

  // Scale pixel values for desktop zoom (rem-based container scales, but Recharts uses pixels)
  const size = Math.round(96 * desktopZoom)
  const center = Math.round(48 * desktopZoom)
  const innerRadius = Math.round(32 * desktopZoom)
  const outerRadius = Math.round(44 * desktopZoom)
  const barSize = Math.round(10 * desktopZoom)
  const cornerRadius = Math.round(5 * desktopZoom)

  return (
    <Card className="p-4">
      <div className="flex items-center gap-4">
        <div className="relative size-24 shrink-0">
          <RadialBarChart
            width={size}
            height={size}
            cx={center}
            cy={center}
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            barSize={barSize}
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
              cornerRadius={cornerRadius}
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

// Worktrees tab types and helpers
type StatusFilter = TaskStatus | 'ORPHANED'

const STATUS_BADGE_COLORS: Record<StatusFilter, string> = {
  IN_PROGRESS: 'bg-muted-foreground/20 text-muted-foreground',
  IN_REVIEW: 'bg-primary/20 text-primary',
  DONE: 'bg-accent/20 text-accent',
  CANCELED: 'bg-destructive/20 text-destructive',
  ORPHANED: 'bg-destructive/20 text-destructive',
}

const ALL_STATUSES: StatusFilter[] = ['IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELED', 'ORPHANED']

function useFormatRelativeTime() {
  const { t } = useTranslation('common')

  return (isoDate: string): string => {
    const date = new Date(isoDate)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    const diffMins = Math.floor(diffSecs / 60)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffDays > 0) {
      return diffDays === 1 ? t('time.dayAgo') : t('time.daysAgo', { count: diffDays })
    }
    if (diffHours > 0) {
      return diffHours === 1 ? t('time.hourAgo') : t('time.hoursAgo', { count: diffHours })
    }
    if (diffMins > 0) {
      return diffMins === 1 ? t('time.minuteAgo') : t('time.minutesAgo', { count: diffMins })
    }
    return t('time.justNow')
  }
}

function WorktreesTab() {
  const { t } = useTranslation('common')
  const { t: tw } = useTranslation('worktrees')
  const formatRelativeTime = useFormatRelativeTime()
  const { worktrees, summary, isLoading, isLoadingDetails, error, refetch } = useWorktrees()
  const deleteWorktree = useDeleteWorktree()
  const [selectedStatuses, setSelectedStatuses] = useState<Set<StatusFilter>>(new Set())
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [bulkDeleteLinkedTasks, setBulkDeleteLinkedTasks] = useState(false)
  const [deletingPath, setDeletingPath] = useState<string | null>(null)
  const [deleteDialogWorktree, setDeleteDialogWorktree] = useState<Worktree | null>(null)
  const [deleteLinkedTask, setDeleteLinkedTask] = useState(false)

  const toggleStatus = (status: StatusFilter) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev)
      if (next.has(status)) {
        next.delete(status)
      } else {
        next.add(status)
      }
      return next
    })
  }

  const clearFilters = () => {
    setSelectedStatuses(new Set())
  }

  const filteredWorktrees = useMemo(() => {
    if (selectedStatuses.size === 0) return worktrees
    return worktrees.filter((w) => {
      if (w.isOrphaned && selectedStatuses.has('ORPHANED')) return true
      if (w.taskStatus && selectedStatuses.has(w.taskStatus)) return true
      return false
    })
  }, [worktrees, selectedStatuses])

  const completedWorktrees = useMemo(() => {
    return worktrees.filter((w) => w.taskStatus === 'DONE' || w.taskStatus === 'CANCELED')
  }, [worktrees])

  const handleBulkDelete = async () => {
    if (completedWorktrees.length === 0) return
    setIsBulkDeleting(true)
    try {
      for (const worktree of completedWorktrees) {
        await deleteWorktree.mutateAsync({
          worktreePath: worktree.path,
          repoPath: worktree.repoPath,
          deleteLinkedTask: bulkDeleteLinkedTasks,
        })
      }
      setBulkDeleteDialogOpen(false)
      refetch()
    } catch {
      // Keep dialog open on error
    } finally {
      setIsBulkDeleting(false)
    }
  }

  const handleDelete = async (worktree: Worktree, shouldDeleteLinkedTask: boolean) => {
    setDeletingPath(worktree.path)
    try {
      await deleteWorktree.mutateAsync({
        worktreePath: worktree.path,
        repoPath: worktree.repoPath,
        deleteLinkedTask: shouldDeleteLinkedTask,
      })
      setDeleteDialogWorktree(null)
      refetch()
    } catch {
      // Keep dialog open on error
    } finally {
      setDeletingPath(null)
    }
  }

  const handleDeleteDialogChange = (open: boolean) => {
    if (!open) {
      setDeleteDialogWorktree(null)
      setDeleteLinkedTask(false)
    }
  }

  const handleBulkDeleteDialogChange = (open: boolean) => {
    setBulkDeleteDialogOpen(open)
    if (!open) {
      setBulkDeleteLinkedTasks(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary and actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {(summary || worktrees.length > 0) && (
            <>
              <span>{tw('summary.total', { count: summary?.total ?? worktrees.length })}</span>
              {(summary?.orphaned ?? worktrees.filter((w) => w.isOrphaned).length) > 0 && (
                <span className="text-destructive">
                  {tw('summary.orphaned', { count: summary?.orphaned ?? worktrees.filter((w) => w.isOrphaned).length })}
                </span>
              )}
              {isLoadingDetails ? (
                <span className="animate-pulse">{t('status.calculating')}</span>
              ) : summary ? (
                <span>{summary.totalSizeFormatted}</span>
              ) : null}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {completedWorktrees.length > 0 && (
            <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={handleBulkDeleteDialogChange}>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                    disabled={isLoadingDetails}
                  />
                }
              >
                <HugeiconsIcon icon={CleanIcon} size={12} strokeWidth={2} />
                {tw('cleanup.button', { count: completedWorktrees.length })}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{tw('cleanup.title')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {tw('cleanup.description', { count: completedWorktrees.length })}
                    {bulkDeleteLinkedTasks && ` ${tw('cleanup.linkedTasksWillBeDeleted')}`}
                  </AlertDialogDescription>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <Checkbox
                        checked={bulkDeleteLinkedTasks}
                        onCheckedChange={(checked) => setBulkDeleteLinkedTasks(checked === true)}
                        disabled={isBulkDeleting}
                      />
                      {tw('cleanup.alsoDeleteLinkedTasks')}
                    </label>
                    <p className="font-medium text-destructive text-xs">
                      {tw('cleanup.cannotUndo')}
                    </p>
                  </div>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isBulkDeleting}>{t('buttons.cancel')}</AlertDialogCancel>
                  <Button
                    variant="destructive"
                    onClick={handleBulkDelete}
                    disabled={isBulkDeleting}
                    className="gap-2"
                  >
                    {isBulkDeleting && (
                      <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                    )}
                    {isBulkDeleting ? t('status.deleting') : tw('delete.button', { count: completedWorktrees.length })}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {selectedStatuses.size > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-xs">
              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
              {t('buttons.clearFilters')}
            </Button>
          )}
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {ALL_STATUSES.map((status) => {
          const isSelected = selectedStatuses.has(status)
          return (
            <button
              key={status}
              onClick={() => toggleStatus(status)}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                isSelected
                  ? STATUS_BADGE_COLORS[status]
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {t(`statuses.${status}`)}
            </button>
          )
        })}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <HugeiconsIcon icon={Loading03Icon} className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {tw('error.failedToLoad', { message: error.message })}
        </div>
      )}

      {!isLoading && !error && filteredWorktrees.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          {selectedStatuses.size > 0 ? tw('empty.noMatch') : tw('empty.noWorktrees')}
        </div>
      )}

      {!isLoading && filteredWorktrees.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {filteredWorktrees.map((worktree) => {
            const isLoadingDetails = worktree.sizeFormatted === '...' || worktree.branch === '...'
            const hasLinkedTask = !worktree.isOrphaned && worktree.taskId
            const isDeleting = deletingPath === worktree.path

            return (
              <Card key={worktree.path} className="transition-colors hover:border-border/80">
                <CardContent className="flex items-start justify-between gap-4 py-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{worktree.name}</span>
                      {worktree.isOrphaned ? (
                        <Badge className={cn('shrink-0', STATUS_BADGE_COLORS.ORPHANED)}>
                          {t('statuses.ORPHANED')}
                        </Badge>
                      ) : worktree.taskStatus ? (
                        <Badge className={cn('shrink-0', STATUS_BADGE_COLORS[worktree.taskStatus])}>
                          {t(`statuses.${worktree.taskStatus}`)}
                        </Badge>
                      ) : null}
                    </div>

                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <HugeiconsIcon icon={Folder01Icon} size={12} strokeWidth={2} className="shrink-0" />
                        <span className="truncate font-mono">{worktree.path}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <div className="flex items-center gap-1.5">
                          <HugeiconsIcon icon={GitBranchIcon} size={12} strokeWidth={2} className="shrink-0" />
                          {worktree.branch === '...' ? (
                            <span className="inline-block animate-pulse rounded bg-muted h-3 w-16" />
                          ) : (
                            <span className="font-mono">{worktree.branch}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <HugeiconsIcon icon={HardDriveIcon} size={12} strokeWidth={2} className="shrink-0" />
                          {worktree.sizeFormatted === '...' ? (
                            <span className="inline-block animate-pulse rounded bg-muted h-3 w-12" />
                          ) : (
                            <span>{worktree.sizeFormatted}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <HugeiconsIcon icon={Calendar03Icon} size={12} strokeWidth={2} className="shrink-0" />
                          <span>{formatRelativeTime(worktree.lastModified)}</span>
                        </div>
                      </div>

                      {worktree.taskId && worktree.taskTitle && (
                        <div className="flex items-center gap-1.5 pt-1">
                          <Link
                            to="/tasks/$taskId"
                            params={{ taskId: worktree.taskId }}
                            className="inline-flex items-center gap-1 text-foreground hover:underline"
                          >
                            <span className="truncate">{worktree.taskTitle}</span>
                            <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={2} className="shrink-0" />
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>

                  <AlertDialog
                    open={deleteDialogWorktree?.path === worktree.path}
                    onOpenChange={handleDeleteDialogChange}
                  >
                    <AlertDialogTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={isLoadingDetails || isDeleting}
                          onClick={() => setDeleteDialogWorktree(worktree)}
                        />
                      }
                    >
                      <HugeiconsIcon
                        icon={isDeleting ? Loading03Icon : Delete02Icon}
                        size={14}
                        strokeWidth={2}
                        className={isDeleting ? 'animate-spin' : ''}
                      />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{tw('delete.title')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {tw('delete.description')}{' '}
                          <span className="font-mono">{worktree.name}</span>.
                          {deleteLinkedTask && hasLinkedTask && (
                            <>
                              {' '}
                              {tw('delete.linkedTaskWillBeDeleted', { title: worktree.taskTitle })}
                            </>
                          )}{' '}
                          {tw('delete.cannotUndo')}
                        </AlertDialogDescription>
                        {hasLinkedTask && (
                          <label className="flex items-center gap-2 text-sm text-foreground">
                            <Checkbox
                              checked={deleteLinkedTask}
                              onCheckedChange={(checked) => setDeleteLinkedTask(checked === true)}
                              disabled={isDeleting}
                            />
                            {tw('delete.alsoDeleteLinkedTask', { title: worktree.taskTitle })}
                          </label>
                        )}
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>{t('buttons.cancel')}</AlertDialogCancel>
                        <Button
                          variant="destructive"
                          onClick={() => handleDelete(worktree, deleteLinkedTask)}
                          disabled={isDeleting}
                          className="gap-2"
                        >
                          {isDeleting && (
                            <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                          )}
                          {isDeleting ? t('status.deleting') : t('buttons.delete')}
                        </Button>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MonitoringPage() {
  const { t } = useTranslation('monitoring')
  const { data: developerMode } = useDeveloperMode()
  const navigate = useNavigate()
  const { tab: tabFromUrl } = Route.useSearch()

  const activeTab = tabFromUrl || 'system'

  const setActiveTab = useCallback((newTab: MonitoringTab) => {
    navigate({
      to: '/monitoring',
      search: newTab === 'system' ? {} : { tab: newTab },
      replace: true,
    })
  }, [navigate])

  const tabs: { value: MonitoringTab; label: string; devOnly?: boolean }[] = [
    { value: 'system', label: t('tabs.system') },
    { value: 'processes', label: t('tabs.processes') },
    { value: 'claude', label: t('tabs.claude') },
    { value: 'vibora', label: t('tabs.vibora'), devOnly: true },
    { value: 'worktrees', label: t('tabs.worktrees') },
    { value: 'usage', label: t('tabs.usage') },
  ]

  const visibleTabs = tabs.filter(tab => !tab.devOnly || developerMode?.enabled)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center border-b border-border bg-background px-4 py-2">
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
            <TabsList variant="line">
              {visibleTabs.map(tab => (
                <TabsTrigger key={tab.value} value={tab.value} className="px-3 py-1.5">{tab.label}</TabsTrigger>
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
        {activeTab === 'worktrees' && <WorktreesTab />}
        {activeTab === 'usage' && <ClaudeUsageLimitsTab />}
      </div>
    </div>
  )
}
