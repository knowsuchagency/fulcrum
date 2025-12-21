import { useState, useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useWorktrees, useDeleteWorktree } from '@/hooks/use-worktrees'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
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
  FilterIcon,
  GitBranchIcon,
  Folder01Icon,
  Calendar03Icon,
  HardDriveIcon,
  ArrowRight01Icon,
  Loading03Icon,
  Alert02Icon,
} from '@hugeicons/core-free-icons'
import type { Worktree } from '@/types'

export const Route = createFileRoute('/worktrees/')({
  component: WorktreesView,
})

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`
  }
  if (diffHours > 0) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`
  }
  if (diffMins > 0) {
    return diffMins === 1 ? '1 minute ago' : `${diffMins} minutes ago`
  }
  return 'just now'
}

function WorktreeCard({
  worktree,
  onDelete,
  isDeleting,
}: {
  worktree: Worktree
  onDelete: (worktree: Worktree) => void
  isDeleting: boolean
}) {
  return (
    <Card className="transition-colors hover:border-border/80">
      <CardContent className="flex items-start justify-between gap-4 py-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{worktree.name}</span>
            {worktree.isOrphaned && (
              <Badge variant="destructive" className="shrink-0">
                Orphaned
              </Badge>
            )}
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
                <span className="font-mono">{worktree.branch}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <HugeiconsIcon
                  icon={HardDriveIcon}
                  size={12}
                  strokeWidth={2}
                  className="shrink-0"
                />
                <span>{worktree.sizeFormatted}</span>
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

        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                disabled={isDeleting}
              />
            }
          >
            {isDeleting ? (
              <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
            ) : (
              <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
            )}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Worktree</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the worktree directory at{' '}
                <span className="font-mono">{worktree.name}</span>.
                {!worktree.isOrphaned && (
                  <>
                    {' '}
                    The linked task <span className="font-medium">"{worktree.taskTitle}"</span> will
                    also be deleted.
                  </>
                )}{' '}
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => onDelete(worktree)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}

function WorktreesView() {
  const { data, isLoading, error } = useWorktrees()
  const deleteWorktree = useDeleteWorktree()
  const [showOrphanedOnly, setShowOrphanedOnly] = useState(false)
  const [deletingPath, setDeletingPath] = useState<string | null>(null)

  const filteredWorktrees = useMemo(() => {
    if (!data?.worktrees) return []
    if (showOrphanedOnly) {
      return data.worktrees.filter((w) => w.isOrphaned)
    }
    return data.worktrees
  }, [data?.worktrees, showOrphanedOnly])

  const handleDelete = async (worktree: Worktree) => {
    setDeletingPath(worktree.path)
    try {
      await deleteWorktree.mutateAsync({
        worktreePath: worktree.path,
        repoPath: worktree.repoPath,
      })
    } finally {
      setDeletingPath(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-medium">Worktrees</h1>
          {data?.summary && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{data.summary.total} total</span>
              {data.summary.orphaned > 0 && (
                <span className="text-destructive">{data.summary.orphaned} orphaned</span>
              )}
              <span>{data.summary.totalSizeFormatted}</span>
            </div>
          )}
        </div>

        <Button
          variant={showOrphanedOnly ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setShowOrphanedOnly(!showOrphanedOnly)}
          className="gap-1.5"
        >
          <HugeiconsIcon icon={FilterIcon} size={14} strokeWidth={2} />
          {showOrphanedOnly ? 'Showing Orphaned' : 'Show Orphaned Only'}
        </Button>
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
            <span className="text-sm">Failed to load worktrees: {error.message}</span>
          </div>
        )}

        {!isLoading && !error && filteredWorktrees.length === 0 && (
          <div className="py-12 text-muted-foreground">
            <p className="text-sm">
              {showOrphanedOnly
                ? 'No orphaned worktrees found.'
                : 'No worktrees found. Worktrees are created when you create tasks with branches.'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredWorktrees.map((worktree) => (
            <WorktreeCard
              key={worktree.path}
              worktree={worktree}
              onDelete={handleDelete}
              isDeleting={deletingPath === worktree.path}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
