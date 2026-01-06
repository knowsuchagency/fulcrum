import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  useJob,
  useJobLogs,
  useJobsAvailable,
  useEnableJob,
  useDisableJob,
  useRunJobNow,
  useDeleteJob,
} from '@/hooks/use-jobs'
import type { JobScope, JobLogEntry } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  Alert02Icon,
  PlayIcon,
  StopIcon,
  Delete02Icon,
  ArrowLeft01Icon,
  Calendar02Icon,
  Clock01Icon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
  LockIcon,
  RefreshIcon,
  Timer02Icon,
  CpuIcon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { CodeBlock } from '@/components/ui/code-block'

type JobTab = 'general' | 'logs'

interface JobDetailSearch {
  tab?: JobTab
  scope?: JobScope
}

export const Route = createFileRoute('/jobs/$jobId')({
  component: JobDetailView,
  validateSearch: (search: Record<string, unknown>): JobDetailSearch => ({
    tab: ['general', 'logs'].includes(search.tab as string)
      ? (search.tab as JobTab)
      : undefined,
    scope: ['user', 'system'].includes(search.scope as string)
      ? (search.scope as JobScope)
      : undefined,
  }),
})

function getStateColor(state: string, enabled: boolean) {
  if (!enabled) return 'bg-gray-400'
  switch (state) {
    case 'active':
      return 'bg-green-500'
    case 'waiting':
      return 'bg-blue-500'
    case 'failed':
      return 'bg-red-500'
    default:
      return 'bg-gray-400'
  }
}

function getStateBadgeVariant(state: string, enabled: boolean): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!enabled) return 'outline'
  switch (state) {
    case 'active':
      return 'default'
    case 'waiting':
      return 'secondary'
    case 'failed':
      return 'destructive'
    default:
      return 'outline'
  }
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString()
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const isPast = diffMs < 0
  const absDiffMs = Math.abs(diffMs)

  const diffMins = Math.floor(absDiffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  let relative: string
  if (diffMins < 60) relative = `${diffMins}m`
  else if (diffHours < 24) relative = `${diffHours}h ${diffMins % 60}m`
  else relative = `${diffDays}d ${diffHours % 24}h`

  return isPast ? `${relative} ago` : `in ${relative}`
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) return '-'

  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else if (seconds > 0) {
    return `${seconds}.${Math.floor((ms % 1000) / 100)}s`
  } else {
    return `${ms}ms`
  }
}

// Parse systemd time span (e.g., "1d", "5min", "2h30m") into human-readable format
function formatTimeSpan(span: string): string {
  // Common time unit mappings
  const units: Record<string, string> = {
    'us': 'microsecond',
    'usec': 'microsecond',
    'ms': 'millisecond',
    'msec': 'millisecond',
    's': 'second',
    'sec': 'second',
    'second': 'second',
    'seconds': 'second',
    'm': 'minute',
    'min': 'minute',
    'minute': 'minute',
    'minutes': 'minute',
    'h': 'hour',
    'hr': 'hour',
    'hour': 'hour',
    'hours': 'hour',
    'd': 'day',
    'day': 'day',
    'days': 'day',
    'w': 'week',
    'week': 'week',
    'weeks': 'week',
    'M': 'month',
    'month': 'month',
    'months': 'month',
    'y': 'year',
    'year': 'year',
    'years': 'year',
  }

  // Match number + unit patterns (e.g., "1d", "30min", "2h30m")
  const pattern = /(\d+)\s*(us|usec|ms|msec|s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?|w|weeks?|M|months?|y|years?)/gi
  const parts: string[] = []
  let match

  while ((match = pattern.exec(span)) !== null) {
    const value = parseInt(match[1], 10)
    const unitKey = match[2].toLowerCase()
    const unit = units[unitKey] || unitKey
    const plural = value !== 1 ? 's' : ''
    parts.push(`${value} ${unit}${plural}`)
  }

  return parts.length > 0 ? parts.join(' ') : span
}

function formatSchedule(schedule: string | null): string[] {
  if (!schedule) return []

  const lines: string[] = []

  // Split by comma for multiple schedule entries
  const entries = schedule.split(/,\s*/)

  for (const entry of entries) {
    const trimmed = entry.trim()

    // Parse monotonic timer entries
    if (trimmed.startsWith('OnStartupSec=')) {
      const value = trimmed.replace('OnStartupSec=', '')
      lines.push(`${formatTimeSpan(value)} after startup`)
    } else if (trimmed.startsWith('OnBootSec=')) {
      const value = trimmed.replace('OnBootSec=', '')
      lines.push(`${formatTimeSpan(value)} after boot`)
    } else if (trimmed.startsWith('OnUnitActiveSec=')) {
      const value = trimmed.replace('OnUnitActiveSec=', '')
      lines.push(`Every ${formatTimeSpan(value)}`)
    } else if (trimmed.startsWith('OnUnitInactiveSec=')) {
      const value = trimmed.replace('OnUnitInactiveSec=', '')
      lines.push(`${formatTimeSpan(value)} after becoming inactive`)
    } else if (trimmed.startsWith('OnActiveSec=')) {
      const value = trimmed.replace('OnActiveSec=', '')
      lines.push(`${formatTimeSpan(value)} after timer activation`)
    } else if (trimmed) {
      // Calendar expressions - pass through as-is (already human-readable)
      lines.push(trimmed)
    }
  }

  return lines
}

function LogEntry({ entry }: { entry: JobLogEntry }) {
  const priorityClass = {
    error: 'text-red-500',
    warning: 'text-yellow-500',
    info: 'text-foreground',
  }[entry.priority]

  const time = new Date(entry.timestamp).toLocaleTimeString()

  return (
    <div className={`font-mono text-xs ${priorityClass}`}>
      <span className="text-muted-foreground">{time}</span>{' '}
      <span>{entry.message}</span>
    </div>
  )
}

function JobDetailView() {
  const { t } = useTranslation('jobs')
  const { jobId } = Route.useParams()
  const { tab, scope = 'user' } = Route.useSearch()
  const navigate = useNavigate()
  const activeTab = tab || 'general'

  const { data: jobsInfo } = useJobsAvailable()
  const { data: job, isLoading, error, refetch } = useJob(jobId, scope)
  const { data: logsData, refetch: refetchLogs } = useJobLogs(jobId, scope, 200)
  const enableJob = useEnableJob()
  const disableJob = useDisableJob()
  const runJobNow = useRunJobNow()
  const deleteJob = useDeleteJob()

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const displayName = jobId.replace('.timer', '')
  const isSystemJob = scope === 'system'
  const canModify = (jobsInfo?.canCreate ?? false) && !isSystemJob

  const setTab = (newTab: JobTab) => {
    navigate({
      to: '/jobs/$jobId',
      params: { jobId },
      search: { tab: newTab !== 'general' ? newTab : undefined, scope },
      replace: true,
    })
  }

  const handleToggleEnabled = async () => {
    if (!job) return
    try {
      if (job.enabled) {
        await disableJob.mutateAsync({ name: job.name, scope: job.scope })
        toast.success(t('actions.disable') + ' successful')
      } else {
        await enableJob.mutateAsync({ name: job.name, scope: job.scope })
        toast.success(t('actions.enable') + ' successful')
      }
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  const handleRunNow = async () => {
    if (!job) return
    try {
      await runJobNow.mutateAsync({ name: job.name, scope: job.scope })
      toast.success(t('actions.runNow') + ' triggered')
      refetch()
      refetchLogs()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
  }

  const handleDelete = async () => {
    if (!job) return
    try {
      await deleteJob.mutateAsync(job.name)
      toast.success('Job deleted')
      navigate({ to: '/monitoring', search: { tab: 'jobs' } })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    }
    setShowDeleteConfirm(false)
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <HugeiconsIcon icon={Loading03Icon} size={24} strokeWidth={2} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <HugeiconsIcon icon={Alert02Icon} size={48} strokeWidth={1.5} className="text-destructive opacity-50" />
        <p className="text-muted-foreground">{error?.message || 'Job not found'}</p>
        <Link to="/monitoring" search={{ tab: 'jobs' }}>
          <Button variant="outline">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} data-slot="icon" />
            {t('title')}
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-background px-4 py-3">
        {/* Top row: Back button, title, badges */}
        <div className="flex items-center gap-3">
          <Link to="/monitoring" search={{ tab: 'jobs' }} className="shrink-0 text-muted-foreground hover:text-foreground">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={20} strokeWidth={2} />
          </Link>

          <div className={`h-3 w-3 shrink-0 rounded-full ${getStateColor(job.state, job.enabled)}`} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold">{displayName}</h1>
              <Badge variant={getStateBadgeVariant(job.state, job.enabled)}>
                {job.enabled ? t(`status.${job.state}`) : t('status.disabled')}
              </Badge>
              {isSystemJob && (
                <Badge variant="outline" className="gap-1">
                  <HugeiconsIcon icon={LockIcon} size={10} strokeWidth={2} />
                  {t('scope.system')}
                </Badge>
              )}
            </div>
            {job.description && (
              <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{job.description}</p>
            )}
          </div>
        </div>

        {/* Action buttons - stack on mobile */}
        {canModify && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunNow}
              disabled={runJobNow.isPending}
            >
              {runJobNow.isPending ? (
                <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" data-slot="icon" />
              ) : (
                <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={2} data-slot="icon" />
              )}
              {t('actions.runNow')}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleEnabled}
              disabled={enableJob.isPending || disableJob.isPending}
            >
              <HugeiconsIcon icon={job.enabled ? StopIcon : PlayIcon} size={14} strokeWidth={2} data-slot="icon" />
              {job.enabled ? t('actions.disable') : t('actions.enable')}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-destructive hover:text-destructive"
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} data-slot="icon" />
              {t('actions.delete')}
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setTab(v as JobTab)} className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-4 mt-2 w-fit">
          <TabsTrigger value="general">{t('detail.tabs.general')}</TabsTrigger>
          <TabsTrigger value="logs">{t('detail.tabs.logs')}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="flex-1 overflow-auto p-4">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Schedule Info */}
            <div className="space-y-4 min-w-0">
              <h2 className="text-sm font-medium text-muted-foreground">{t('detail.schedule')}</h2>
              <div className="rounded-lg border p-4 space-y-3 overflow-hidden">
                <div className="flex items-start gap-2">
                  <HugeiconsIcon icon={Calendar02Icon} size={16} strokeWidth={2} className="shrink-0 text-muted-foreground mt-0.5" />
                  <div className="min-w-0 flex-1 flex flex-col gap-1">
                    {formatSchedule(job.schedule).length > 0 ? (
                      formatSchedule(job.schedule).map((line, i) => (
                        <span key={i} className="break-all text-sm">{line}</span>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </div>
                </div>
                {/* Don't show next/last run for continuous jobs (KeepAlive/RunAtLoad) */}
                {job.schedule !== 'KeepAlive' && job.schedule !== 'RunAtLoad' && (
                  <div className={`grid gap-4 text-sm ${job.nextRun ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                    {job.nextRun && (
                      <div>
                        <div className="text-muted-foreground">{t('detail.nextRun')}</div>
                        <div className="flex items-center gap-1.5">
                          <HugeiconsIcon icon={Clock01Icon} size={14} strokeWidth={2} className="shrink-0 text-muted-foreground" />
                          <span>{formatRelativeTime(job.nextRun)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(job.nextRun)}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-muted-foreground">{t('detail.lastRun')}</div>
                      <div className="flex items-center gap-1.5">
                        {job.lastResult === 'success' && (
                          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={2} className="shrink-0 text-green-500" />
                        )}
                        {job.lastResult === 'failed' && (
                          <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} className="shrink-0 text-red-500" />
                        )}
                        <span>{formatRelativeTime(job.lastRun)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(job.lastRun)}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Command Info */}
            <div className="space-y-4 min-w-0">
              <h2 className="text-sm font-medium text-muted-foreground">{t('detail.command')}</h2>
              <div className="space-y-3 overflow-hidden">
                {job.command ? (
                  <CodeBlock code={job.command} language="bash" className="max-h-48" />
                ) : (
                  <div className="rounded-lg border p-4">
                    <span className="text-muted-foreground text-sm">-</span>
                  </div>
                )}
                {job.workingDirectory && (
                  <div className="text-sm break-all px-1">
                    <span className="text-muted-foreground">{t('detail.workingDir')}: </span>
                    <code className="font-mono break-all">{job.workingDirectory}</code>
                  </div>
                )}
              </div>
            </div>

            {/* Execution Stats */}
            {(job.lastRunDurationMs !== null || job.lastRunCpuTimeMs !== null) && (
              <div className="space-y-4">
                <h2 className="text-sm font-medium text-muted-foreground">{t('detail.executionStats')}</h2>
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground flex items-center gap-1.5">
                        <HugeiconsIcon icon={Timer02Icon} size={14} strokeWidth={2} />
                        {t('detail.duration')}
                      </div>
                      <div className="font-mono">{formatDuration(job.lastRunDurationMs)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground flex items-center gap-1.5">
                        <HugeiconsIcon icon={CpuIcon} size={14} strokeWidth={2} />
                        {t('detail.cpuTime')}
                      </div>
                      <div className="font-mono">{formatDuration(job.lastRunCpuTimeMs)}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Timer/Plist File (user jobs only) */}
            {!isSystemJob && job.timerContent && (
              <div className="space-y-4 md:col-span-2 min-w-0">
                <h2 className="text-sm font-medium text-muted-foreground">{t('detail.timerFile')}</h2>
                <CodeBlock
                  code={job.timerContent}
                  language={jobsInfo?.platform === 'launchd' ? 'xml' : 'ini'}
                  className="max-h-64"
                />
              </div>
            )}

            {/* Service File (systemd only, user timers only) */}
            {!isSystemJob && job.serviceContent && (
              <div className="space-y-4 md:col-span-2 min-w-0">
                <h2 className="text-sm font-medium text-muted-foreground">{t('detail.serviceFile')}</h2>
                <CodeBlock code={job.serviceContent} language="ini" className="max-h-64" />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="logs" className="flex flex-1 flex-col overflow-hidden p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">{t('logs.title')}</h2>
            <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
              <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={2} data-slot="icon" />
              {t('logs.refresh')}
            </Button>
          </div>
          <div className="flex-1 overflow-auto rounded-lg border bg-muted p-4">
            {logsData?.entries && logsData.entries.length > 0 ? (
              <div className="space-y-1">
                {logsData.entries.map((entry, i) => (
                  <LogEntry key={i} entry={entry} />
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground text-sm">{t('logs.noLogs')}</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete.confirm', { name: displayName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('delete.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              {t('delete.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
