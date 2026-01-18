import { useState, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
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
  PinIcon,
  PinOffIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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
import { useWorktrees, useDeleteWorktree, usePinWorktree } from '@/hooks/use-worktrees'
import { cn } from '@/lib/utils'
import type { Worktree, TaskStatus } from '@/types'

type StatusFilter = TaskStatus | 'ORPHANED'

const STATUS_BADGE_COLORS: Record<StatusFilter, string> = {
  TO_DO: 'bg-muted/50 text-muted-foreground',
  IN_PROGRESS: 'bg-muted-foreground/20 text-muted-foreground',
  IN_REVIEW: 'bg-primary/20 text-primary',
  DONE: 'bg-accent/20 text-accent',
  CANCELED: 'bg-destructive/20 text-destructive',
  ORPHANED: 'bg-destructive/20 text-destructive',
}

const ALL_STATUSES: StatusFilter[] = ['TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELED', 'ORPHANED']

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

export default function WorktreesTab() {
  const { t } = useTranslation('common')
  const { t: tw } = useTranslation('worktrees')
  const formatRelativeTime = useFormatRelativeTime()
  const { worktrees, summary, isLoading, isLoadingDetails, error, refetch } = useWorktrees()
  const deleteWorktree = useDeleteWorktree()
  const pinWorktree = usePinWorktree()
  const [selectedStatuses, setSelectedStatuses] = useState<Set<StatusFilter>>(new Set())
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [bulkDeleteLinkedTasks, setBulkDeleteLinkedTasks] = useState(false)
  const [deletingPath, setDeletingPath] = useState<string | null>(null)
  const [pinningPath, setPinningPath] = useState<string | null>(null)
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

  // Worktrees eligible for bulk cleanup (completed and not pinned)
  const deletableWorktrees = useMemo(() => {
    return completedWorktrees.filter((w) => !w.pinned)
  }, [completedWorktrees])

  // Pinned completed worktrees (will be skipped during cleanup)
  const pinnedCompletedWorktrees = useMemo(() => {
    return completedWorktrees.filter((w) => w.pinned)
  }, [completedWorktrees])

  const handleBulkDelete = async () => {
    if (deletableWorktrees.length === 0) return
    setIsBulkDeleting(true)
    try {
      for (const worktree of deletableWorktrees) {
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

  const handleTogglePin = async (worktree: Worktree) => {
    if (!worktree.taskId) return
    setPinningPath(worktree.path)
    try {
      await pinWorktree.mutateAsync({
        taskId: worktree.taskId,
        pinned: !worktree.pinned,
      })
      refetch()
    } finally {
      setPinningPath(null)
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
          {deletableWorktrees.length > 0 && (
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
                {tw('cleanup.button', { count: deletableWorktrees.length })}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{tw('cleanup.title')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {tw('cleanup.description', { count: deletableWorktrees.length })}
                    {bulkDeleteLinkedTasks && ` ${tw('cleanup.linkedTasksWillBeDeleted')}`}
                  </AlertDialogDescription>
                  <div className="space-y-3">
                    {pinnedCompletedWorktrees.length > 0 && (
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <HugeiconsIcon icon={PinIcon} size={12} strokeWidth={2} />
                        {tw('cleanup.pinnedSkipped', { count: pinnedCompletedWorktrees.length })}
                      </p>
                    )}
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
                    {isBulkDeleting ? t('status.deleting') : tw('delete.button', { count: deletableWorktrees.length })}
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

                  <div className="flex shrink-0 items-center gap-1">
                    {hasLinkedTask && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className={cn(
                          'text-muted-foreground',
                          worktree.pinned ? 'text-primary hover:text-primary/80' : 'hover:text-foreground'
                        )}
                        disabled={isLoadingDetails || pinningPath === worktree.path}
                        onClick={() => handleTogglePin(worktree)}
                        title={worktree.pinned ? tw('pin.unpin') : tw('pin.pin')}
                      >
                        {pinningPath === worktree.path ? (
                          <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                        ) : (
                          <HugeiconsIcon icon={worktree.pinned ? PinIcon : PinOffIcon} size={14} strokeWidth={worktree.pinned ? 3 : 2} />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                      disabled={isLoadingDetails || isDeleting || worktree.pinned}
                      onClick={() => setDeleteDialogWorktree(worktree)}
                      title={worktree.pinned ? tw('delete.unpinFirst') : tw('delete.title')}
                    >
                      <HugeiconsIcon
                        icon={isDeleting ? Loading03Icon : Delete02Icon}
                        size={14}
                        strokeWidth={2}
                        className={isDeleting ? 'animate-spin' : ''}
                      />
                    </Button>
                    <AlertDialog
                      open={deleteDialogWorktree?.path === worktree.path}
                      onOpenChange={handleDeleteDialogChange}
                    >
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
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
