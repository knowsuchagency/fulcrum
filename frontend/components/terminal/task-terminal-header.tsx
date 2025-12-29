import { useRef, useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Task01Icon,
  LibraryIcon,
  GitBranchIcon,
  Delete02Icon,
} from '@hugeicons/core-free-icons'
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
import { GitActionsButtons } from './git-actions-buttons'
import { TaskActionsDropdown } from './task-actions-dropdown'
import { GitStatusBadge } from '@/components/viewer/git-status-badge'
import { useDeleteTask } from '@/hooks/use-tasks'

interface TaskInfo {
  taskId: string
  repoId?: string
  repoName: string
  title: string
  repoPath: string
  worktreePath: string
  baseBranch: string
  branch: string | null
  prUrl?: string | null
}

interface TaskTerminalHeaderProps {
  taskInfo: TaskInfo
  terminalId: string
  terminalCwd?: string
  isMobile?: boolean
  sendInputToTerminal?: (terminalId: string, text: string) => void
}

const COMPACT_THRESHOLD = 350
const HIDE_BADGE_THRESHOLD = 250

export function TaskTerminalHeader({
  taskInfo,
  terminalId,
  terminalCwd,
  isMobile,
  sendInputToTerminal,
}: TaskTerminalHeaderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState<number>(Infinity)
  const deleteTask = useDeleteTask()

  // Use ResizeObserver to track container width
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  const isCompact = isMobile || containerWidth < COMPACT_THRESHOLD
  const showBadge = containerWidth >= HIDE_BADGE_THRESHOLD

  const handleDeleteTask = () => {
    deleteTask.mutate({ taskId: taskInfo.taskId, deleteLinkedWorktree: true })
  }

  return (
    <div
      ref={containerRef}
      className="flex shrink-0 items-center justify-between border-b border-border bg-card"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1">
        {/* Task title - always visible, won't shrink */}
        <Link
          to="/tasks/$taskId"
          params={{ taskId: taskInfo.taskId }}
          className="flex shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 max-w-[50%]"
        >
          <HugeiconsIcon icon={Task01Icon} size={14} strokeWidth={2} className="shrink-0" />
          <span className="truncate">{taskInfo.title}</span>
        </Link>

        {isCompact ? (
          // Compact mode: status badge (if space) + unified dropdown
          <>
            {showBadge && (
              <GitStatusBadge worktreePath={taskInfo.worktreePath} />
            )}
            <div className="ml-auto flex items-center">
              <TaskActionsDropdown
                repoPath={taskInfo.repoPath}
                worktreePath={taskInfo.worktreePath}
                baseBranch={taskInfo.baseBranch}
                taskId={taskInfo.taskId}
                repoId={taskInfo.repoId}
                repoName={taskInfo.repoName}
                terminalId={terminalId}
                sendInputToTerminal={sendInputToTerminal}
              />
            </div>
          </>
        ) : (
          // Full mode: all elements visible
          <>
            <Link
              to={taskInfo.repoId ? '/repositories/$repoId' : '/repositories'}
              params={taskInfo.repoId ? { repoId: taskInfo.repoId } : undefined}
              className="flex min-w-0 items-center gap-1 text-xs font-medium text-foreground cursor-pointer hover:underline"
            >
              <HugeiconsIcon icon={LibraryIcon} size={12} strokeWidth={2} className="shrink-0" />
              <span className="truncate">{taskInfo.repoName}</span>
            </Link>
            {terminalCwd && (
              <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <HugeiconsIcon icon={GitBranchIcon} size={12} strokeWidth={2} className="shrink-0" />
                <span className="truncate">{terminalCwd.split('/').pop()}</span>
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
              <GitStatusBadge worktreePath={taskInfo.worktreePath} />
              <GitActionsButtons
                repoPath={taskInfo.repoPath}
                worktreePath={taskInfo.worktreePath}
                baseBranch={taskInfo.baseBranch}
                taskId={taskInfo.taskId}
                isMobile={isMobile}
                terminalId={terminalId}
                sendInputToTerminal={sendInputToTerminal}
              />
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="h-5 w-5 text-muted-foreground hover:text-destructive"
                      title="Delete task"
                      disabled={deleteTask.isPending}
                    />
                  }
                >
                  <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={2} />
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Task</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete this task and its worktree.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteTask}
                      variant="destructive"
                      disabled={deleteTask.isPending}
                    >
                      {deleteTask.isPending ? 'Deleting...' : 'Delete'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
