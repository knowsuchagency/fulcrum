import { useState, useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useWorktrees, useDeleteWorktree } from '@/hooks/use-worktrees'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Delete02Icon,
  GitBranchIcon,
  Folder01Icon,
  Calendar03Icon,
  HardDriveIcon,
  ArrowRight01Icon,
  Loading03Icon,
  Alert02Icon,
  Cancel01Icon,
  CleanIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import type { Worktree, TaskStatus } from '@/types'

type StatusFilter = TaskStatus | 'ORPHANED'

const STATUS_BADGE_COLORS: Record<StatusFilter, string> = {
  IN_PROGRESS: 'bg-muted-foreground/20 text-muted-foreground',
  IN_REVIEW: 'bg-primary/20 text-primary',
  DONE: 'bg-accent/20 text-accent',
  CANCELED: 'bg-destructive/20 text-destructive',
  ORPHANED: 'bg-destructive/20 text-destructive',
}

export const Route = createFileRoute('/worktrees/')({
  component: WorktreesView,
})

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

function LoadingSkeleton({ className }: { className?: string }) {
  return <span className={`inline-block animate-pulse rounded bg-muted ${className}`} />
}

function WorktreeCard({
  worktree,
  onDelete,
}: {
  worktree: Worktree
  onDelete: (worktree: Worktree, deleteLinkedTask: boolean) => Promise<void>
}) {
  const { t } = useTranslation('common')
  const { t: tw } = useTranslation('worktrees')
  const formatRelativeTime = useFormatRelativeTime()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteLinkedTask, setDeleteLinkedTask] = useState(false)
  const isLoadingDetails = worktree.sizeFormatted === '...' || worktree.branch === '...'
  const hasLinkedTask = !worktree.isOrphaned && worktree.taskId

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await onDelete(worktree, deleteLinkedTask)
      setDialogOpen(false)
    } catch {
      // Keep dialog open on error so user can retry
    } finally {
      setIsDeleting(false)
    }
  }

  // Reset checkbox when dialog closes
  const handleOpenChange = (open: boolean) => {
    setDialogOpen(open)
    if (!open) {
      setDeleteLinkedTask(false)
    }
  }

  return (
    <Card className="transition-colors hover:border-border/80">
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
                <HugeiconsIcon
                  icon={GitBranchIcon}
                  size={12}
                  strokeWidth={2}
                  className="shrink-0"
                />
                {worktree.branch === '...' ? (
                  <LoadingSkeleton className="h-3 w-16" />
                ) : (
                  <span className="font-mono">{worktree.branch}</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <HugeiconsIcon
                  icon={HardDriveIcon}
                  size={12}
                  strokeWidth={2}
                  className="shrink-0"
                />
                {worktree.sizeFormatted === '...' ? (
                  <LoadingSkeleton className="h-3 w-12" />
                ) : (
                  <span>{worktree.sizeFormatted}</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <HugeiconsIcon
                  icon={Calendar03Icon}
                  size={12}
                  strokeWidth={2}
                  className="shrink-0"
                />
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
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={12}
                    strokeWidth={2}
                    className="shrink-0"
                  />
                </Link>
              </div>
            )}
          </div>
        </div>

        <AlertDialog open={dialogOpen} onOpenChange={handleOpenChange}>
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                disabled={isLoadingDetails}
              />
            }
          >
            <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
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
                onClick={handleDelete}
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
}

const ALL_STATUSES: StatusFilter[] = ['IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELED', 'ORPHANED']

function WorktreesView() {
  const { t } = useTranslation('common')
  const { t: tw } = useTranslation('worktrees')
  const { worktrees, summary, isLoading, isLoadingDetails, error, refetch } = useWorktrees()
  const deleteWorktree = useDeleteWorktree()
  const [selectedStatuses, setSelectedStatuses] = useState<Set<StatusFilter>>(new Set())
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [bulkDeleteLinkedTasks, setBulkDeleteLinkedTasks] = useState(false)

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
      // Keep dialog open on error so user can see what happened
    } finally {
      setIsBulkDeleting(false)
    }
  }

  const handleBulkDeleteDialogChange = (open: boolean) => {
    setBulkDeleteDialogOpen(open)
    if (!open) {
      setBulkDeleteLinkedTasks(false)
    }
  }

  const handleDelete = async (worktree: Worktree, deleteLinkedTask: boolean) => {
    await deleteWorktree.mutateAsync({
      worktreePath: worktree.path,
      repoPath: worktree.repoPath,
      deleteLinkedTask,
    })
    refetch()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-sm font-medium">{tw('title')}</h1>
            {(summary || worktrees.length > 0) && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
              </div>
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
                      <p className="text-sm text-muted-foreground">
                        {completedWorktrees.filter((w) => w.taskStatus === 'DONE').length > 0 && (
                          <span className="mr-3">
                            <span className="font-medium text-accent">
                              {completedWorktrees.filter((w) => w.taskStatus === 'DONE').length}
                            </span>{' '}
                            {tw('cleanup.done')}
                          </span>
                        )}
                        {completedWorktrees.filter((w) => w.taskStatus === 'CANCELED').length > 0 && (
                          <span>
                            <span className="font-medium text-destructive">
                              {completedWorktrees.filter((w) => w.taskStatus === 'CANCELED').length}
                            </span>{' '}
                            {tw('cleanup.canceled')}
                          </span>
                        )}
                      </p>
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
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          size={14}
                          strokeWidth={2}
                          className="animate-spin"
                        />
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
      </div>

      <div className="pixel-grid flex-1 overflow-auto p-4">
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
            <span className="text-sm">{tw('error.failedToLoad', { message: error.message })}</span>
          </div>
        )}

        {!isLoading && !error && filteredWorktrees.length === 0 && (
          <div className="py-12 text-muted-foreground">
            <p className="text-sm">
              {selectedStatuses.size > 0
                ? tw('empty.noMatch')
                : tw('empty.noWorktrees')}
            </p>
          </div>
        )}

        {!isLoading && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredWorktrees.map((worktree) => (
              <WorktreeCard
                key={worktree.path}
                worktree={worktree}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
