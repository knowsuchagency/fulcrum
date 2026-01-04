import { useState, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { fuzzyScore } from '@/lib/fuzzy-search'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  Loading03Icon,
  Delete02Icon,
  Calendar02Icon,
  PlusSignIcon,
  Alert02Icon,
  Search01Icon,
  PlayIcon,
  StopIcon,
  Clock01Icon,
  CheckmarkCircle02Icon,
  FilterIcon,
  LockIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useJobs, useEnableJob, useDisableJob, useRunJobNow, useDeleteJob } from '@/hooks/use-jobs'
import type { SystemdTimer } from '@/types'

// Jobs tab helpers
function getJobStateColor(state: string, enabled: boolean) {
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

function getJobStateBadgeVariant(state: string, enabled: boolean): 'default' | 'secondary' | 'destructive' | 'outline' {
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

function formatJobNextRun(nextRun: string | null): string {
  if (!nextRun) return '-'
  const date = new Date(nextRun)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()

  if (diffMs < 0) return 'overdue'

  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m`
  return `${diffDays}d ${diffHours % 24}h`
}

function formatJobLastRun(lastRun: string | null): string {
  if (!lastRun) return 'never'
  const date = new Date(lastRun)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()

  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function JobCard({
  job,
  onToggleEnabled,
  onRunNow,
  onDelete,
}: {
  job: SystemdTimer
  onToggleEnabled: () => void
  onRunNow: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation('jobs')
  const isSystemJob = job.scope === 'system'
  const displayName = job.name.replace('.timer', '')

  return (
    <Card className="h-full group transition-colors hover:border-foreground/20">
      <Link
        to="/jobs/$jobId"
        params={{ jobId: job.name }}
        search={{ scope: job.scope }}
        className="block"
      >
        <CardContent className="flex flex-col gap-3 py-4">
          {/* Header: Status indicator + Name */}
          <div className="flex items-start gap-3">
            <div className={`mt-1.5 h-2.5 w-2.5 rounded-full ${getJobStateColor(job.state, job.enabled)}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="block truncate font-medium group-hover:text-primary transition-colors">
                  {displayName}
                </span>
                <Badge variant={getJobStateBadgeVariant(job.state, job.enabled)} className="shrink-0">
                  {job.enabled ? t(`status.${job.state}`) : t('status.disabled')}
                </Badge>
                {isSystemJob && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge variant="outline" className="shrink-0 gap-1">
                          <HugeiconsIcon icon={LockIcon} size={10} strokeWidth={2} />
                          {t('scope.system')}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('systemTimerReadonly')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              {job.description && (
                <div className="mt-1 text-xs text-muted-foreground truncate">
                  {job.description}
                </div>
              )}
            </div>
          </div>

          {/* Schedule */}
          {job.schedule && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <HugeiconsIcon icon={Calendar02Icon} size={12} strokeWidth={2} className="shrink-0" />
              <span className="truncate">{job.schedule}</span>
            </div>
          )}

          {/* Next/Last run */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <HugeiconsIcon icon={Clock01Icon} size={12} strokeWidth={2} />
              <span>{t('nextRun')}: {formatJobNextRun(job.nextRun)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {job.lastResult === 'success' && (
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} strokeWidth={2} className="text-green-500" />
              )}
              {job.lastResult === 'failed' && (
                <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} className="text-red-500" />
              )}
              <span>{t('lastRun')}: {formatJobLastRun(job.lastRun)}</span>
            </div>
          </div>
        </CardContent>
      </Link>

      <CardContent className="pt-0 pb-4 px-6">
        <div className="mt-auto flex flex-wrap gap-1">
          {!isSystemJob && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onRunNow}
                className="text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={2} data-slot="icon" />
                <span className="max-sm:hidden">{t('actions.runNow')}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={onToggleEnabled}
                className="text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={job.enabled ? StopIcon : PlayIcon} size={14} strokeWidth={2} data-slot="icon" />
                <span className="max-sm:hidden">{job.enabled ? t('actions.disable') : t('actions.enable')}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                className="text-muted-foreground hover:text-destructive"
              >
                <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} data-slot="icon" />
                <span className="max-sm:hidden">{t('actions.delete')}</span>
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function JobsTab({ scopeFilter, onScopeChange }: { scopeFilter: 'all' | 'user' | 'system'; onScopeChange: (scope: 'all' | 'user' | 'system') => void }) {
  const { t } = useTranslation('jobs')
  const { data: jobs, isLoading, error } = useJobs(scopeFilter)
  const enableJob = useEnableJob()
  const disableJob = useDisableJob()
  const runJobNow = useRunJobNow()
  const deleteJob = useDeleteJob()
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<SystemdTimer | null>(null)

  const filteredJobs = useMemo(() => {
    if (!jobs) return []

    let result = jobs

    // Apply search query
    if (searchQuery?.trim()) {
      result = result
        .map((job) => ({
          job,
          score: Math.max(
            fuzzyScore(job.name, searchQuery),
            fuzzyScore(job.description ?? '', searchQuery)
          ),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ job }) => job)
    }

    return result
  }, [jobs, searchQuery])

  // Group jobs by scope
  const userJobs = filteredJobs.filter((j) => j.scope === 'user')
  const systemJobs = filteredJobs.filter((j) => j.scope === 'system')

  const handleToggleEnabled = async (job: SystemdTimer) => {
    if (job.enabled) {
      await disableJob.mutateAsync({ name: job.name, scope: job.scope })
    } else {
      await enableJob.mutateAsync({ name: job.name, scope: job.scope })
    }
  }

  const handleRunNow = async (job: SystemdTimer) => {
    await runJobNow.mutateAsync({ name: job.name, scope: job.scope })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await deleteJob.mutateAsync(deleteTarget.name)
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-4">
      {/* Search and filter controls */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-64 sm:flex-none">
          <HugeiconsIcon
            icon={Search01Icon}
            size={12}
            strokeWidth={2}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full pl-6"
          />
        </div>
        <Select
          value={scopeFilter}
          onValueChange={(v) => onScopeChange(v as 'all' | 'user' | 'system')}
        >
          <SelectTrigger size="sm" className="shrink-0 gap-1.5">
            <HugeiconsIcon icon={FilterIcon} size={12} strokeWidth={2} className="text-muted-foreground" />
            <SelectValue>
              {t(`scope.${scopeFilter}`)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="min-w-[120px]">
            <SelectItem value="all">{t('scope.all')}</SelectItem>
            <SelectItem value="user">{t('scope.user')}</SelectItem>
            <SelectItem value="system">{t('scope.system')}</SelectItem>
          </SelectContent>
        </Select>
        <div className="hidden sm:block flex-1" />
        <Link to="/jobs/new">
          <Button size="sm">
            <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">{t('createJob')}</span>
          </Button>
        </Link>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <HugeiconsIcon
            icon={Loading03Icon}
            size={24}
            strokeWidth={2}
            className="animate-spin text-muted-foreground"
          />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 py-6 text-destructive">
          <HugeiconsIcon icon={Alert02Icon} size={20} strokeWidth={2} />
          <span className="text-sm">{t('errors.loadFailed')}: {error.message}</span>
        </div>
      )}

      {!isLoading && !error && jobs?.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <HugeiconsIcon icon={Calendar02Icon} size={48} strokeWidth={1.5} className="mx-auto mb-4 opacity-50" />
          <p className="text-sm">{t('noJobs')}</p>
          <Link to="/jobs/new" className="mt-4 inline-block">
            <Button>
              <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} data-slot="icon" />
              {t('createJob')}
            </Button>
          </Link>
        </div>
      )}

      {!isLoading && !error && jobs && jobs.length > 0 && filteredJobs.length === 0 && (
        <div className="py-12 text-muted-foreground">
          <p className="text-sm">{t('noJobsMatch')}</p>
        </div>
      )}

      {/* User Jobs */}
      {userJobs.length > 0 && (
        <div className="mb-6">
          {(scopeFilter === 'all' || systemJobs.length > 0) && (
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              {t('scope.user')} ({userJobs.length})
            </h2>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {userJobs.map((job) => (
              <JobCard
                key={`${job.scope}-${job.name}`}
                job={job}
                onToggleEnabled={() => handleToggleEnabled(job)}
                onRunNow={() => handleRunNow(job)}
                onDelete={() => setDeleteTarget(job)}
              />
            ))}
          </div>
        </div>
      )}

      {/* System Jobs */}
      {systemJobs.length > 0 && (
        <div>
          {userJobs.length > 0 && (
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              {t('scope.system')} ({systemJobs.length})
            </h2>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {systemJobs.map((job) => (
              <JobCard
                key={`${job.scope}-${job.name}`}
                job={job}
                onToggleEnabled={() => handleToggleEnabled(job)}
                onRunNow={() => handleRunNow(job)}
                onDelete={() => setDeleteTarget(job)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete.confirm', { name: deleteTarget?.name.replace('.timer', '') })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('delete.cancel')}</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete}>
              {t('delete.delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
