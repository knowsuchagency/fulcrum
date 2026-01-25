import { createFileRoute, Link, useNavigate, useLocation } from '@tanstack/react-router'
import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { reaction } from 'mobx'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { useTask, useUpdateTask } from '@/hooks/use-tasks'
import { useRepositories } from '@/hooks/use-repositories'
import { useTaskViewState } from '@/hooks/use-task-view-state'
import { useGitSync } from '@/hooks/use-git-sync'
import { useGitMergeToMain } from '@/hooks/use-git-merge'
import { useGitPush } from '@/hooks/use-git-push'
import { useGitSyncParent } from '@/hooks/use-git-sync-parent'
import { useGitCreatePR } from '@/hooks/use-git-create-pr'
import { useKillClaudeInTask } from '@/hooks/use-kill-claude'
import { useEditorApp, useEditorHost, useEditorSshPort, usePort, useOpencodeModel } from '@/hooks/use-config'
import { useTerminalWS } from '@/hooks/use-terminal-ws'
import { useStore } from '@/stores'
import { buildEditorUrl, openExternalUrl } from '@/lib/editor-url'
import { TaskTerminal } from '@/components/terminal/task-terminal'
import { DiffViewer } from '@/components/viewer/diff-viewer'
import { BrowserPreview } from '@/components/viewer/browser-preview'
import { FilesViewer } from '@/components/viewer/files-viewer'
import { GitStatusBadge } from '@/components/viewer/git-status-badge'
import { NonWorktreeTaskView } from '@/components/task/non-worktree-task-view'
import { TaskDetailsPanel } from '@/components/task/task-details-panel'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CodeIcon,
  BrowserIcon,
  GitBranchIcon,
  Delete02Icon,
  Folder01Icon,
  FolderLibraryIcon,
  GitPullRequestIcon,
  ArrowRight03Icon,
  ArrowLeft03Icon,
  ArrowUp03Icon,
  Orbit01Icon,
  VisualStudioCodeIcon,
  ReloadIcon,
  GitCommitIcon,
  More03Icon,
  Link01Icon,
  PaintBrush01Icon,
  File01Icon,
  SourceCodeCircleIcon,
} from '@hugeicons/core-free-icons'
import type { TaskLinkType } from '@/types'
import { DeleteTaskDialog } from '@/components/delete-task-dialog'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { TaskStatus } from '@/types'
import { useIsMobile } from '@/hooks/use-is-mobile'

type TabType = 'diff' | 'browser' | 'files' | 'details'

interface TaskViewSearch {
  tab?: TabType
  file?: string
}

export const Route = createFileRoute('/tasks/$taskId')({
  component: TaskView,
  validateSearch: (search: Record<string, unknown>): TaskViewSearch => ({
    tab: ['diff', 'browser', 'files', 'details'].includes(search.tab as string)
      ? (search.tab as TabType)
      : undefined,
    file: typeof search.file === 'string' ? search.file : undefined,
  }),
})

const STATUS_LABELS: Record<TaskStatus, string> = {
  TO_DO: 'To Do',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  DONE: 'Done',
  CANCELED: 'Canceled',
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  TO_DO: 'bg-status-todo/20 text-status-todo',
  IN_PROGRESS: 'bg-status-in-progress/20 text-status-in-progress',
  IN_REVIEW: 'bg-status-in-review/20 text-status-in-review',
  DONE: 'bg-status-done/20 text-status-done',
  CANCELED: 'bg-status-canceled/20 text-status-canceled',
}

function getLinkIcon(type: TaskLinkType | null) {
  switch (type) {
    case 'pr':
      return GitPullRequestIcon
    case 'issue':
      return SourceCodeCircleIcon
    case 'docs':
      return File01Icon
    case 'design':
      return PaintBrush01Icon
    default:
      return Link01Icon
  }
}

function TaskView() {
  const { t } = useTranslation('common')
  const { taskId } = Route.useParams()
  const searchParams = Route.useSearch()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: task, isLoading } = useTask(taskId)
  const updateTask = useUpdateTask()
  const { viewState, setActiveTab, setFilesViewState } = useTaskViewState(taskId)
  const gitSync = useGitSync()
  const gitMerge = useGitMergeToMain()
  const gitPush = useGitPush()
  const gitSyncParent = useGitSyncParent()
  const gitCreatePR = useGitCreatePR()
  const killClaude = useKillClaudeInTask()
  const { data: editorApp } = useEditorApp()
  const { data: editorHost } = useEditorHost()
  const { data: editorSshPort } = useEditorSshPort()
  const { data: serverPort } = usePort()
  const { data: globalOpencodeModel } = useOpencodeModel()
  const { data: repositories = [] } = useRepositories()

  // Find the repository matching this task's repo path
  const repository = repositories.find((r) => r.path === task?.repoPath)

  // Resolve OpenCode model: task > repo > global (cascade precedence)
  const resolvedOpencodeModel = task?.opencodeModel ?? repository?.opencodeModel ?? globalOpencodeModel

  // Read AI mode state - prefer persisted task data, fall back to navigation state for backward compat
  const navState = location.state as { aiMode?: 'default' | 'plan'; description?: string; focusTerminal?: boolean } | undefined
  const aiMode = (task?.aiMode as 'default' | 'plan' | undefined) ?? navState?.aiMode
  const aiModeDescription = task?.description ?? navState?.description

  // Capture focusTerminal on first render before TanStack Router replaces the state
  const initialFocusTerminalRef = useRef<boolean | undefined>(undefined)
  if (initialFocusTerminalRef.current === undefined && navState?.focusTerminal !== undefined) {
    initialFocusTerminalRef.current = navState.focusTerminal
  }
  const shouldAutoFocus = initialFocusTerminalRef.current ?? false

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState<'terminal' | 'details'>('terminal')
  const [terminalKey, setTerminalKey] = useState(0)
  const [pendingRetryTerminalId, setPendingRetryTerminalId] = useState<string | null>(null)
  const isMobile = useIsMobile()

  // Inline title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [titleWidth, setTitleWidth] = useState<number | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const titleTextRef = useRef<HTMLHeadingElement>(null)

  // Determine if this is a worktree task (has worktree path)
  const isWorktreeTask = !!task?.worktreePath

  // Determine the active tab - URL takes precedence, then database state
  const activeTab = searchParams.tab ?? viewState.activeTab
  const activeFile = searchParams.file ?? viewState.filesViewState.selectedFile

  // Track if we've synced the URL for this task
  const urlSyncedRef = useRef<string | null>(null)

  // Sync URL with persisted state on mount (only if URL has no tab param)
  useEffect(() => {
    // Only sync once per task, and only if URL doesn't have tab param
    if (urlSyncedRef.current === taskId || searchParams.tab) {
      return
    }
    urlSyncedRef.current = taskId

    if (viewState.activeTab) {
      navigate({
        to: '/tasks/$taskId',
        params: { taskId },
        search: {
          tab: viewState.activeTab === 'diff' ? undefined : viewState.activeTab,
          file: viewState.filesViewState.selectedFile || undefined,
        },
        replace: true,
      })
    }
  }, [taskId, searchParams.tab, viewState.activeTab, viewState.filesViewState.selectedFile, navigate])

  // Handle tab change - update both URL and database
  const handleTabChange = useCallback(
    (newTab: string) => {
      const tab = newTab as TabType
      setActiveTab(tab) // Persist to database
      navigate({
        to: '/tasks/$taskId',
        params: { taskId },
        search: {
          tab: tab === 'diff' ? undefined : tab,
          file: tab === 'files' ? activeFile || undefined : undefined,
        },
        replace: true,
      })
    },
    [taskId, navigate, setActiveTab, activeFile]
  )

  // Handle file selection change from FilesViewer
  const handleFileChange = useCallback(
    (file: string | null) => {
      setFilesViewState({ selectedFile: file }) // Persist to database
      navigate({
        to: '/tasks/$taskId',
        params: { taskId },
        search: {
          tab: 'files',
          file: file || undefined,
        },
        replace: true,
      })
    },
    [taskId, navigate, setFilesViewState]
  )

  // Get terminal functions for sending commands and managing terminals
  const { terminals, sendInputToTerminal, destroyTerminal } = useTerminalWS()
  const store = useStore()

  // Find the terminal for this task (matches if cwd is the worktree or a subdirectory)
  const taskTerminal = terminals.find((t) =>
    task?.worktreePath && t.cwd.startsWith(task.worktreePath)
  )

  // Watch for pending retry terminal to be removed using MobX reaction
  // (useEffect with terminals dependency doesn't work because component isn't observer)
  useEffect(() => {
    if (!pendingRetryTerminalId) return

    const dispose = reaction(
      // Data function: check if terminal still exists in store
      () => store.terminals.items.some(t => t.id === pendingRetryTerminalId),
      // Effect function: when terminal is removed, complete the retry
      (stillExists) => {
        if (!stillExists) {
          setPendingRetryTerminalId(null)
          setTerminalKey(k => k + 1)
        }
      },
      { fireImmediately: true }
    )

    return dispose
  }, [pendingRetryTerminalId, store])

  // Focus title input when entering edit mode
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  const handleStartEditTitle = () => {
    if (task) {
      // Capture the width of the title text before switching to edit mode
      if (titleTextRef.current) {
        setTitleWidth(titleTextRef.current.offsetWidth)
      }
      setEditedTitle(task.title)
      setIsEditingTitle(true)
    }
  }

  const handleSaveTitle = () => {
    if (!task) return
    const trimmedTitle = editedTitle.trim()
    if (trimmedTitle && trimmedTitle !== task.title) {
      updateTask.mutate({
        taskId: task.id,
        updates: { title: trimmedTitle },
      })
    }
    setIsEditingTitle(false)
  }

  const handleCancelEditTitle = () => {
    setIsEditingTitle(false)
    setEditedTitle('')
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveTitle()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEditTitle()
    }
  }

  // Restart task terminal - destroys existing and forces TaskTerminal remount
  const handleRetry = () => {
    if (!task?.worktreePath) return
    // Read fresh terminal from store (not from potentially stale hook snapshot)
    const freshTerminal = store.terminals.items.find(t =>
      t.cwd.startsWith(task.worktreePath!)
    )
    if (freshTerminal) {
      // Store ID and destroy - reaction will increment key when removal is confirmed
      setPendingRetryTerminalId(freshTerminal.id)
      destroyTerminal(freshTerminal.id, { force: true, reason: 'retry' })
    } else {
      // No terminal to destroy, just increment key immediately
      setTerminalKey(k => k + 1)
    }
  }

  // Send prompt to Claude Code to resolve git issues
  const resolveWithClaude = (prompt: string) => {
    if (taskTerminal) {
      sendInputToTerminal(taskTerminal.id, prompt)
      toast.info(t('git.sentToClaude'))
    } else {
      toast.error(t('git.noTerminal'))
    }
  }

  const handleSync = async () => {
    if (!task?.repoPath || !task?.worktreePath) return

    try {
      await gitSync.mutateAsync({
        repoPath: task.repoPath,
        worktreePath: task.worktreePath,
        baseBranch: task.baseBranch ?? undefined,
      })
      toast.success(t('git.syncedFromMain'))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed'
      const branch = task.baseBranch || 'main'
      toast.error(errorMessage, {
        action: taskTerminal ? {
          label: 'Resolve with Claude',
          onClick: () => resolveWithClaude(
            `Rebase this worktree onto the parent repo's ${branch} branch. Error: "${errorMessage}". Steps: 1) Check for uncommitted changes - stash or commit them first, 2) git fetch origin (in parent repo at ${task.repoPath}) to ensure ${branch} is current, 3) git rebase ${branch} (in worktree), 4) Resolve any conflicts carefully - do not lose functionality or introduce regressions, 5) If stashed, git stash pop. Worktree: ${task.worktreePath}, Parent repo: ${task.repoPath}.`
          ),
        } : undefined,
      })
    }
  }

  const handleMergeToMain = async () => {
    if (!task?.repoPath || !task?.worktreePath) return

    try {
      await gitMerge.mutateAsync({
        repoPath: task.repoPath,
        worktreePath: task.worktreePath,
        baseBranch: task.baseBranch ?? undefined,
      })
      toast.success(t('git.mergedToMain'))
      // Kill Claude if running in the task's terminals
      killClaude.mutate(task.id)
      // Mark task as done after successful merge
      updateTask.mutate({
        taskId: task.id,
        updates: { status: 'DONE' },
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Merge failed'
      const branch = task.baseBranch || 'main'
      toast.error(errorMessage, {
        action: taskTerminal ? {
          label: 'Resolve with Claude',
          onClick: () => resolveWithClaude(
            `Merge this worktree's branch into the parent repo's ${branch}. Error: "${errorMessage}". Steps: 1) Ensure all changes in worktree are committed, 2) In parent repo at ${task.repoPath}, checkout ${branch} and pull latest from origin, 3) Squash merge the worktree branch into ${branch} (use git merge --squash, then commit), 4) Resolve any conflicts carefully - do not lose functionality or introduce regressions, 5) Push ${branch} to origin. Worktree: ${task.worktreePath}, Parent repo: ${task.repoPath}.`
          ),
        } : undefined,
      })
    }
  }

  const handlePush = async () => {
    if (!task?.worktreePath) return

    try {
      await gitPush.mutateAsync({
        worktreePath: task.worktreePath,
      })
      toast.success(t('git.pushedToOrigin'))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Push failed'
      toast.error(errorMessage, {
        action: taskTerminal ? {
          label: 'Resolve with Claude',
          onClick: () => resolveWithClaude(
            `Push this worktree's branch to origin. Error: "${errorMessage}". Steps: 1) Check for uncommitted changes and commit them, 2) If push is rejected, pull the latest changes first and resolve any conflicts, 3) Push to origin again. Worktree: ${task.worktreePath}.`
          ),
        } : undefined,
      })
    }
  }

  const handleSyncParent = async () => {
    if (!task?.repoPath) return

    try {
      await gitSyncParent.mutateAsync({
        repoPath: task.repoPath,
        baseBranch: task.baseBranch ?? undefined,
      })
      toast.success(t('git.parentSynced'))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync parent failed'
      const branch = task.baseBranch || 'main'
      toast.error(errorMessage, {
        action: taskTerminal ? {
          label: 'Resolve with Claude',
          onClick: () => resolveWithClaude(
            `Sync the parent repo's ${branch} branch with origin. Error: "${errorMessage}". Steps: 1) git fetch origin, 2) git pull origin ${branch} --ff-only, 3) If that fails, rebase with git rebase origin/${branch}, 4) Resolve any conflicts carefully - do not lose functionality or introduce regressions, 5) Once in sync, git push origin ${branch}. Work in the parent repo at ${task.repoPath}, not the worktree.`
          ),
        } : undefined,
      })
    }
  }

  // Send commit prompt to Claude Code
  const handleCommit = () => {
    if (!taskTerminal) return
    sendInputToTerminal(taskTerminal.id, 'commit')
  }

  // Create PR programmatically, fall back to Claude Code on error
  const handleCreatePR = async () => {
    if (!task?.worktreePath) return

    try {
      const result = await gitCreatePR.mutateAsync({
        worktreePath: task.worktreePath,
        title: task.title,
        baseBranch: task.baseBranch ?? undefined,
      })
      // Auto-link PR to task
      updateTask.mutate({
        taskId: task.id,
        updates: { prUrl: result.prUrl },
      })
      toast.success(t('git.prCreated'), {
        action: {
          label: 'View PR',
          onClick: () => openExternalUrl(result.prUrl),
        },
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create PR'
      // Check if PR already exists and we have the URL
      const existingPrUrl = err && typeof err === 'object' && 'existingPrUrl' in err
        ? (err as { existingPrUrl?: string }).existingPrUrl
        : undefined
      if (existingPrUrl) {
        // Auto-link the existing PR
        updateTask.mutate({
          taskId: task.id,
          updates: { prUrl: existingPrUrl },
        })
        toast.info(t('git.prExists'), {
          action: {
            label: 'View PR',
            onClick: () => openExternalUrl(existingPrUrl),
          },
        })
        return
      }
      // Show short error in toast, send full error to Claude
      const shortError = errorMessage.split('\n').filter(Boolean).pop() || errorMessage
      toast.error(shortError, {
        action: {
          label: 'Resolve with Claude',
          onClick: () => resolveWithClaude(
            `Create a PR for this task. Error: "${errorMessage}". After creating, link it using: fulcrum current-task pr <url>. Worktree: ${task.worktreePath}.`
          ),
        },
      })
    }
  }

  const handleOpenEditor = () => {
    if (!task?.worktreePath) return
    const url = buildEditorUrl(task.worktreePath, editorApp, editorHost, editorSshPort)
    openExternalUrl(url)
  }

  const handleStatusChange = (status: string) => {
    if (task) {
      updateTask.mutate({
        taskId: task.id,
        updates: { status: status as TaskStatus },
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading task...</p>
      </div>
    )
  }

  if (!task) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Task not found</p>
        <Link to="/tasks">
          <Button variant="outline">Back to Tasks</Button>
        </Link>
      </div>
    )
  }

  // Non-worktree task view
  if (!isWorktreeTask) {
    return <NonWorktreeTaskView task={task} />
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Task Header */}
      <div className="film-grain relative shrink-0 border-b border-border px-4 py-2" style={{ background: 'var(--gradient-header)' }}>
        {/* Mobile: Two-row layout */}
        <div className="flex flex-col gap-1 sm:hidden">
          {/* Row 1: Title + status + operations + delete */}
          <div className="flex items-center gap-2">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                onBlur={handleSaveTitle}
                className="min-w-0 flex-1 truncate text-sm font-medium bg-transparent border-b border-primary outline-none"
                style={{ minWidth: titleWidth ? `${titleWidth}px` : undefined }}
              />
            ) : (
              <h1
                ref={titleTextRef}
                className="min-w-0 flex-1 truncate text-sm font-medium cursor-pointer hover:text-primary transition-colors"
                onClick={handleStartEditTitle}
                title="Click to edit title"
              >
                {task.title}
              </h1>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[task.status]}`}
                  />
                }
              >
                {STATUS_LABELS[task.status]}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                  value={task.status}
                  onValueChange={handleStatusChange}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <DropdownMenuRadioItem key={value} value={value}>
                      {label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground" />
                }
              >
                <HugeiconsIcon icon={More03Icon} size={16} strokeWidth={2} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleSync} disabled={gitSync.isPending || !task.worktreePath}>
                  <HugeiconsIcon icon={ArrowRight03Icon} size={14} strokeWidth={2} />
                  Pull from {task.baseBranch}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleMergeToMain} disabled={gitMerge.isPending || !task.worktreePath}>
                  <HugeiconsIcon icon={ArrowLeft03Icon} size={14} strokeWidth={2} />
                  Merge to {task.baseBranch}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePush} disabled={gitPush.isPending || !task.worktreePath}>
                  <HugeiconsIcon icon={ArrowUp03Icon} size={14} strokeWidth={2} />
                  Push to origin
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSyncParent} disabled={gitSyncParent.isPending || !task.repoPath}>
                  <HugeiconsIcon icon={Orbit01Icon} size={14} strokeWidth={2} />
                  Sync parent
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCommit} disabled={!taskTerminal}>
                  <HugeiconsIcon icon={GitCommitIcon} size={14} strokeWidth={2} />
                  Commit
                </DropdownMenuItem>
                {!task.prUrl && (
                  <DropdownMenuItem onClick={handleCreatePR} disabled={gitCreatePR.isPending}>
                    <HugeiconsIcon
                      icon={GitPullRequestIcon}
                      size={14}
                      strokeWidth={2}
                      className={gitCreatePR.isPending ? 'animate-pulse' : ''}
                    />
                    Create PR
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={2} />
            </Button>
          </div>
          {/* Row 2: retry + repo + git status badge */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <button
              type="button"
              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              onClick={handleRetry}
              title="New task terminal"
            >
              <HugeiconsIcon icon={ReloadIcon} size={14} strokeWidth={2} />
            </button>
            {repository ? (
              <Link
                to="/repositories/$repoId"
                params={{ repoId: repository.id }}
                className="flex items-center gap-1 hover:text-primary"
              >
                <HugeiconsIcon icon={FolderLibraryIcon} size={12} strokeWidth={2} />
                <span className="hover:underline">{task.repoName}</span>
              </Link>
            ) : (
              <span className="flex items-center gap-1">
                <HugeiconsIcon icon={FolderLibraryIcon} size={12} strokeWidth={2} />
                {task.repoName}
              </span>
            )}
            <div className="ml-auto">
              <GitStatusBadge worktreePath={task.worktreePath} />
            </div>
          </div>
        </div>

        {/* Desktop: Single-row layout */}
        <div className="hidden items-center gap-3 sm:flex">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-1.5">
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onKeyDown={handleTitleKeyDown}
                  onBlur={handleSaveTitle}
                  className="text-sm font-medium bg-transparent border-b border-primary outline-none"
                  style={{ minWidth: titleWidth ? `${titleWidth}px` : 200 }}
                />
              ) : (
                <h1
                  ref={titleTextRef}
                  className="text-sm font-medium cursor-pointer hover:text-primary transition-colors"
                  onClick={handleStartEditTitle}
                  title="Click to edit title"
                >
                  {task.title}
                </h1>
              )}
              <button
                type="button"
                className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                onClick={handleRetry}
                title="New task terminal"
              >
                <HugeiconsIcon icon={ReloadIcon} size={14} strokeWidth={2} />
              </button>
              {task.links && task.links.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        title="Task links"
                      />
                    }
                  >
                    <HugeiconsIcon icon={Link01Icon} size={14} strokeWidth={2} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-auto">
                    {task.links.map((link) => (
                      <DropdownMenuItem
                        key={link.id}
                        onClick={() => openExternalUrl(link.url)}
                      >
                        <HugeiconsIcon icon={getLinkIcon(link.type)} size={14} strokeWidth={2} />
                        <span>{link.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {repository ? (
                <Link
                  to="/repositories/$repoId"
                  params={{ repoId: repository.id }}
                  className="flex items-center gap-1 hover:text-primary"
                >
                  <HugeiconsIcon icon={FolderLibraryIcon} size={12} strokeWidth={2} />
                  <span className="hover:underline">{task.repoName}</span>
                </Link>
              ) : (
                <span className="flex items-center gap-1">
                  <HugeiconsIcon icon={FolderLibraryIcon} size={12} strokeWidth={2} />
                  {task.repoName}
                </span>
              )}
              <HugeiconsIcon icon={GitBranchIcon} size={12} strokeWidth={2} />
              <span className="font-mono">{task.branch}</span>
              {task.prUrl && (
                <>
                  <span className="text-muted-foreground/50">•</span>
                  <a
                    href={task.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-foreground hover:text-primary font-medium"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <HugeiconsIcon icon={GitPullRequestIcon} size={14} strokeWidth={2} />
                    <span>#{task.prUrl.match(/\/pull\/(\d+)/)?.[1] ?? 'PR'}</span>
                  </a>
                </>
              )}
            </div>
          </div>

          {/* Task status dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[task.status]}`}
                />
              }
            >
              {STATUS_LABELS[task.status]}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={task.status}
                onValueChange={handleStatusChange}
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <DropdownMenuRadioItem key={value} value={value}>
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Desktop: Individual git operation buttons */}
          <div className="flex items-center gap-0">
          {/* Pull from Base Branch Button */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleSync}
            disabled={gitSync.isPending || !task.worktreePath}
            className="text-muted-foreground hover:text-foreground"
            title={`Pull from ${task.baseBranch}`}
          >
            <HugeiconsIcon
              icon={ArrowRight03Icon}
              size={16}
              strokeWidth={2}
              className={gitSync.isPending ? 'animate-spin' : ''}
            />
          </Button>

          {/* Merge to Base Branch Button */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleMergeToMain}
            disabled={gitMerge.isPending || !task.worktreePath}
            className="text-muted-foreground hover:text-foreground"
            title={`Merge to ${task.baseBranch}`}
          >
            <HugeiconsIcon
              icon={ArrowLeft03Icon}
              size={16}
              strokeWidth={2}
              className={gitMerge.isPending ? 'animate-pulse' : ''}
            />
          </Button>

          {/* Push to Origin Button */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handlePush}
            disabled={gitPush.isPending || !task.worktreePath}
            className="text-muted-foreground hover:text-foreground"
            title="Push to origin"
          >
            <HugeiconsIcon
              icon={ArrowUp03Icon}
              size={16}
              strokeWidth={2}
              className={gitPush.isPending ? 'animate-pulse' : ''}
            />
          </Button>

          {/* Sync Parent with Origin Button */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleSyncParent}
            disabled={gitSyncParent.isPending || !task.repoPath}
            className="text-muted-foreground hover:text-foreground"
            title="Sync parent with origin"
          >
            <HugeiconsIcon
              icon={Orbit01Icon}
              size={16}
              strokeWidth={2}
              className={gitSyncParent.isPending ? 'animate-spin' : ''}
            />
          </Button>

          {/* Commit Button */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCommit}
            disabled={!taskTerminal}
            className="text-muted-foreground hover:text-foreground"
            title="Commit"
          >
            <HugeiconsIcon
              icon={GitCommitIcon}
              size={16}
              strokeWidth={2}
            />
          </Button>

          {/* Create PR Button */}
          {!task.prUrl && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleCreatePR}
              disabled={gitCreatePR.isPending}
              className="text-muted-foreground hover:text-foreground"
              title="Create Pull Request"
            >
              <HugeiconsIcon
                icon={GitPullRequestIcon}
                size={16}
                strokeWidth={2}
                className={gitCreatePR.isPending ? 'animate-pulse' : ''}
              />
            </Button>
          )}

          {/* Editor Button */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleOpenEditor}
            disabled={!task.worktreePath}
            className="text-muted-foreground hover:text-foreground"
            title="Open in editor"
          >
            <HugeiconsIcon icon={VisualStudioCodeIcon} size={16} strokeWidth={2} />
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setDeleteDialogOpen(true)}
        >
          <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={2} />
        </Button>
        </div>
      </div>

      {/* Main Content - Mobile tabs or Desktop split */}
      {isMobile ? (
        <Tabs
          value={mobileTab}
          onValueChange={(v) => setMobileTab(v as 'terminal' | 'details')}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="shrink-0 border-b border-border px-2 py-1">
            <TabsList className="w-full">
              <TabsTrigger value="terminal" className="flex-1">Terminal</TabsTrigger>
              <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="terminal" className="flex-1 min-h-0">
            <TaskTerminal
              key={terminalKey}
              taskName={task.title}
              cwd={task.worktreePath}
              taskId={task.id}
              agent={task.agent}
              aiMode={aiMode}
              description={aiModeDescription}
              startupScript={task.startupScript}
              agentOptions={task.agentOptions}
              opencodeModel={resolvedOpencodeModel}
              serverPort={serverPort}
              autoFocus={shouldAutoFocus}
            />
          </TabsContent>

          <TabsContent value="details" className="flex-1 min-h-0 bg-background">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="flex h-full flex-col">
              <div className="film-grain relative flex items-center justify-between shrink-0 border-b border-border px-2 py-1" style={{ background: 'var(--gradient-header)' }}>
                <TabsList variant="line">
                  <TabsTrigger value="diff">
                    <HugeiconsIcon icon={CodeIcon} size={14} strokeWidth={2} data-slot="icon" />
                    Diff
                  </TabsTrigger>
                  <TabsTrigger value="browser">
                    <HugeiconsIcon icon={BrowserIcon} size={14} strokeWidth={2} data-slot="icon" />
                    Browser
                  </TabsTrigger>
                  <TabsTrigger value="files">
                    <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={2} data-slot="icon" />
                    Files
                  </TabsTrigger>
                  <TabsTrigger value="details">
                    <HugeiconsIcon icon={More03Icon} size={14} strokeWidth={2} data-slot="icon" />
                    Details
                  </TabsTrigger>
                </TabsList>
                <GitStatusBadge worktreePath={task.worktreePath} />
              </div>

              <TabsContent value="diff" className="flex-1 overflow-hidden">
                <DiffViewer taskId={task.id} worktreePath={task.worktreePath} baseBranch={task.baseBranch ?? undefined} />
              </TabsContent>

              <TabsContent value="browser" className="flex-1 overflow-hidden">
                <BrowserPreview taskId={task.id} />
              </TabsContent>

              <TabsContent value="files" className="flex-1 overflow-hidden">
                <FilesViewer
                  worktreePath={task.worktreePath}
                  initialSelectedFile={activeFile}
                  onFileChange={handleFileChange}
                />
              </TabsContent>

              <TabsContent value="details" className="flex-1 overflow-hidden">
                <TaskDetailsPanel task={task} />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      ) : (
        <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
          {/* Left: Terminal */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <TaskTerminal
              key={terminalKey}
              taskName={task.title}
              cwd={task.worktreePath}
              taskId={task.id}
              agent={task.agent}
              aiMode={aiMode}
              description={aiModeDescription}
              startupScript={task.startupScript}
              agentOptions={task.agentOptions}
              opencodeModel={resolvedOpencodeModel}
              serverPort={serverPort}
              autoFocus={shouldAutoFocus}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: Diff/Browser Toggle */}
          <ResizablePanel defaultSize={50} minSize={30} className="bg-background">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="flex h-full flex-col">
              <div className="film-grain relative flex items-center justify-between shrink-0 border-b border-border px-2 py-1" style={{ background: 'var(--gradient-header)' }}>
                <TabsList variant="line">
                  <TabsTrigger value="diff">
                    <HugeiconsIcon
                      icon={CodeIcon}
                      size={14}
                      strokeWidth={2}
                      data-slot="icon"
                    />
                    Diff
                  </TabsTrigger>
                  <TabsTrigger value="browser">
                    <HugeiconsIcon
                      icon={BrowserIcon}
                      size={14}
                      strokeWidth={2}
                      data-slot="icon"
                    />
                    Browser
                  </TabsTrigger>
                  <TabsTrigger value="files">
                    <HugeiconsIcon
                      icon={Folder01Icon}
                      size={14}
                      strokeWidth={2}
                      data-slot="icon"
                    />
                    Files
                  </TabsTrigger>
                  <TabsTrigger value="details">
                    <HugeiconsIcon
                      icon={More03Icon}
                      size={14}
                      strokeWidth={2}
                      data-slot="icon"
                    />
                    Details
                  </TabsTrigger>
                </TabsList>
                <GitStatusBadge worktreePath={task.worktreePath} />
              </div>

              <TabsContent value="diff" className="flex-1 overflow-hidden">
                <DiffViewer taskId={task.id} worktreePath={task.worktreePath} baseBranch={task.baseBranch ?? undefined} />
              </TabsContent>

              <TabsContent value="browser" className="flex-1 overflow-hidden">
                <BrowserPreview taskId={task.id} />
              </TabsContent>

              <TabsContent value="files" className="flex-1 overflow-hidden">
                <FilesViewer
                  worktreePath={task.worktreePath}
                  initialSelectedFile={activeFile}
                  onFileChange={handleFileChange}
                />
              </TabsContent>

              <TabsContent value="details" className="flex-1 overflow-hidden">
                <TaskDetailsPanel task={task} />
              </TabsContent>
            </Tabs>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      {/* Delete Task Dialog */}
      <DeleteTaskDialog
        task={task}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onDeleted={() => navigate({ to: '/tasks' })}
      />
    </div>
  )
}
