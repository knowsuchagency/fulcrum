import { useRef, useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  TaskDaily01Icon,
  FolderLibraryIcon,
  GitBranchIcon,
  Delete02Icon,
} from '@hugeicons/core-free-icons'
import { GitActionsButtons } from './git-actions-buttons'
import { TaskActionsDropdown } from './task-actions-dropdown'
import { GitStatusBadge } from '@/components/viewer/git-status-badge'
import { DeleteTaskDialog } from '@/components/delete-task-dialog'
import type { Task } from '@/types'

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
  pinned?: boolean
}

interface TaskTerminalHeaderProps {
  taskInfo: TaskInfo
  terminalId: string
  terminalCwd?: string
  isMobile?: boolean
  sendInputToTerminal?: (terminalId: string, text: string) => void
}

const FULL_THRESHOLD = 600        // All elements visible
const MEDIUM_THRESHOLD = 450      // Hide project/CWD, keep git buttons inline
const HIDE_BADGE_THRESHOLD = 250  // Hide git status badge

export function TaskTerminalHeader({
  taskInfo,
  terminalId,
  terminalCwd,
  isMobile,
  sendInputToTerminal,
}: TaskTerminalHeaderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState<number>(Infinity)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

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

  const showProjectAndCwd = containerWidth >= FULL_THRESHOLD
  const showGitButtonsInline = containerWidth >= MEDIUM_THRESHOLD && !isMobile
  const showBadge = containerWidth >= HIDE_BADGE_THRESHOLD

  // Build a partial Task object for DeleteTaskDialog
  const taskForDialog: Task = {
    id: taskInfo.taskId,
    title: taskInfo.title,
    worktreePath: taskInfo.worktreePath,
    pinned: taskInfo.pinned ?? false,
    // Required fields that aren't used by DeleteTaskDialog
    description: null,
    status: 'IN_PROGRESS',
    position: 0,
    repoPath: taskInfo.repoPath,
    repoName: taskInfo.repoName,
    baseBranch: taskInfo.baseBranch,
    branch: taskInfo.branch,
    viewState: null,
    prUrl: taskInfo.prUrl ?? null,
    startupScript: null,
    agent: 'claude',
    aiMode: null,
    agentOptions: null,
    opencodeModel: null,
    projectId: null,
    repositoryId: null,
    tags: [],
    startedAt: null,
    dueDate: null,
    notes: null,
    createdAt: '',
    updatedAt: '',
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
          <HugeiconsIcon icon={TaskDaily01Icon} size={12} strokeWidth={2} className="shrink-0" />
          <span className="truncate">{taskInfo.title}</span>
        </Link>

        {/* Repository name & CWD - only at widest sizes */}
        {showProjectAndCwd && (
          <>
            {taskInfo.repoId ? (
              <Link
                to="/repositories/$repoId"
                params={{ repoId: taskInfo.repoId }}
                className="flex min-w-0 items-center gap-1 text-xs font-medium text-foreground hover:text-primary"
              >
                <HugeiconsIcon icon={FolderLibraryIcon} size={12} strokeWidth={2} className="shrink-0" />
                <span className="truncate hover:underline">{taskInfo.repoName}</span>
              </Link>
            ) : (
              <span className="flex min-w-0 items-center gap-1 text-xs font-medium text-foreground">
                <HugeiconsIcon icon={FolderLibraryIcon} size={12} strokeWidth={2} className="shrink-0" />
                <span className="truncate">{taskInfo.repoName}</span>
              </span>
            )}
            {terminalCwd && (
              <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <HugeiconsIcon icon={GitBranchIcon} size={12} strokeWidth={2} className="shrink-0" />
                <span className="truncate">{terminalCwd.split('/').pop()}</span>
              </span>
            )}
          </>
        )}

        {/* Right-side actions */}
        <div className="ml-auto flex items-center gap-1">
          {/* Git status badge - visible until very narrow */}
          {showBadge && <GitStatusBadge worktreePath={taskInfo.worktreePath} />}

          {/* Git actions: inline buttons at medium+ width, dropdown when narrower */}
          {showGitButtonsInline ? (
            <>
              <GitActionsButtons
                repoPath={taskInfo.repoPath}
                worktreePath={taskInfo.worktreePath}
                baseBranch={taskInfo.baseBranch}
                taskId={taskInfo.taskId}
                title={taskInfo.title}
                prUrl={taskInfo.prUrl}
                isMobile={isMobile}
                terminalId={terminalId}
                sendInputToTerminal={sendInputToTerminal}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                className="h-5 w-5 text-muted-foreground hover:text-destructive"
                title="Delete task"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={2} />
              </Button>
              <DeleteTaskDialog
                task={taskForDialog}
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
              />
            </>
          ) : (
            <TaskActionsDropdown
              repoPath={taskInfo.repoPath}
              worktreePath={taskInfo.worktreePath}
              baseBranch={taskInfo.baseBranch}
              taskId={taskInfo.taskId}
              title={taskInfo.title}
              prUrl={taskInfo.prUrl}
              repoName={taskInfo.repoName}
              terminalId={terminalId}
              sendInputToTerminal={sendInputToTerminal}
              pinned={taskInfo.pinned}
            />
          )}
        </div>
      </div>
    </div>
  )
}
