import { createFileRoute, Link, useNavigate, useLocation } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { useTask, useUpdateTask, useDeleteTask } from '@/hooks/use-tasks'
import { useTaskTab } from '@/hooks/use-task-tab'
import { useGitSync } from '@/hooks/use-git-sync'
import { useGitMergeToMain } from '@/hooks/use-git-merge'
import { useGitSyncParent } from '@/hooks/use-git-sync-parent'
import { useHostname, useSshPort } from '@/hooks/use-config'
import { useLinearTicket } from '@/hooks/use-linear'
import { useTerminalWS } from '@/hooks/use-terminal-ws'
import { buildVSCodeUrl } from '@/lib/vscode-url'
import { TaskTerminal } from '@/components/terminal/task-terminal'
import { DiffViewer } from '@/components/viewer/diff-viewer'
import { BrowserPreview } from '@/components/viewer/browser-preview'
import { FilesViewer } from '@/components/viewer/files-viewer'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CodeIcon,
  BrowserIcon,
  GitBranchIcon,
  Delete02Icon,
  Folder01Icon,
  GitPullRequestIcon,
  ArrowDown03Icon,
  ArrowUp03Icon,
  Orbit01Icon,
  VisualStudioCodeIcon,
  Task01Icon,
  Settings05Icon,
} from '@hugeicons/core-free-icons'
import { TaskConfigModal } from '@/components/task-config-modal'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { TaskStatus } from '@/types'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isMobile
}

export const Route = createFileRoute('/tasks/$taskId')({
  component: TaskView,
})

const STATUS_LABELS: Record<TaskStatus, string> = {
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  DONE: 'Done',
  CANCELED: 'Canceled',
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  IN_PROGRESS: 'bg-blue-500/20 text-blue-500',
  IN_REVIEW: 'bg-yellow-500/20 text-yellow-600',
  DONE: 'bg-green-500/20 text-green-600',
  CANCELED: 'bg-red-500/20 text-red-500',
}

function TaskView() {
  const { taskId } = Route.useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: task, isLoading } = useTask(taskId)
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const { tab, setTab } = useTaskTab(taskId)
  const gitSync = useGitSync()
  const gitMerge = useGitMergeToMain()
  const gitSyncParent = useGitSyncParent()
  const { data: hostname } = useHostname()
  const { data: sshPort } = useSshPort()
  const { data: linearTicket } = useLinearTicket(task?.linearTicketId ?? null)

  // Read AI mode state from navigation (only set when coming from task creation)
  const navState = location.state as { aiMode?: 'default' | 'plan' | 'none'; description?: string } | undefined
  const aiMode = navState?.aiMode && navState?.description ? navState.aiMode : undefined
  const aiModeDescription = navState?.description

  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncErrorModalOpen, setSyncErrorModalOpen] = useState(false)
  const [syncSuccess, setSyncSuccess] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)
  const [mergeErrorModalOpen, setMergeErrorModalOpen] = useState(false)
  const [mergeSuccess, setMergeSuccess] = useState(false)
  const [syncParentError, setSyncParentError] = useState<string | null>(null)
  const [syncParentErrorModalOpen, setSyncParentErrorModalOpen] = useState(false)
  const [syncParentSuccess, setSyncParentSuccess] = useState(false)
  const [vscodeModalOpen, setVscodeModalOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState<'terminal' | 'details'>('terminal')
  const isMobile = useIsMobile()

  // Get terminal functions for sending commands
  const { terminals, writeToTerminal } = useTerminalWS()

  // Auto-clear sync success message
  useEffect(() => {
    if (syncSuccess) {
      const timer = setTimeout(() => setSyncSuccess(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [syncSuccess])

  // Auto-clear merge success message
  useEffect(() => {
    if (mergeSuccess) {
      const timer = setTimeout(() => setMergeSuccess(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [mergeSuccess])

  // Auto-clear sync parent success message
  useEffect(() => {
    if (syncParentSuccess) {
      const timer = setTimeout(() => setSyncParentSuccess(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [syncParentSuccess])

  const handleSync = async () => {
    if (!task?.repoPath || !task?.worktreePath) return

    setSyncError(null)
    setSyncSuccess(false)

    try {
      await gitSync.mutateAsync({
        repoPath: task.repoPath,
        worktreePath: task.worktreePath,
        baseBranch: task.baseBranch,
      })
      setSyncSuccess(true)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed'
      setSyncError(errorMessage)
      setSyncErrorModalOpen(true)
    }
  }

  // Build a prompt for Claude Code (no newlines)
  const buildClaudePrompt = () => {
    if (!task || !syncError) return ''
    const baseBranch = task.baseBranch || 'main'
    return `Fix the git sync issue. Worktree: ${task.worktreePath} | Parent repo: ${task.repoPath} | Branch: ${task.branch} | Base: ${baseBranch} | Error: ${syncError} | Steps: 1) Check git status 2) Resolve conflicts or commit/stash changes 3) Rebase onto the parent repo's ${baseBranch} branch`
  }

  // Build a prompt for Claude Code for merge errors
  const buildMergeClaudePrompt = () => {
    if (!task || !mergeError) return ''
    const baseBranch = task.baseBranch || 'main'
    return `Fix the git merge issue. Worktree: ${task.worktreePath} | Parent repo: ${task.repoPath} | Branch: ${task.branch} | Base: ${baseBranch} | Error: ${mergeError} | Steps: 1) Check git status in both worktree and parent 2) Resolve any conflicts 3) Ensure worktree changes are committed 4) Retry merge to ${baseBranch} 5) On successful merge, run: vibora tasks move ${task.id} --status done`
  }

  const handleMergeToMain = async () => {
    if (!task?.repoPath || !task?.worktreePath) return

    setMergeError(null)
    setMergeSuccess(false)

    try {
      await gitMerge.mutateAsync({
        repoPath: task.repoPath,
        worktreePath: task.worktreePath,
        baseBranch: task.baseBranch,
      })
      setMergeSuccess(true)
      // Mark task as done after successful merge
      updateTask.mutate({
        taskId: task.id,
        updates: { status: 'DONE' },
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Merge failed'
      setMergeError(errorMessage)
      setMergeErrorModalOpen(true)
    }
  }

  const handleSyncParent = async () => {
    if (!task?.repoPath) return

    setSyncParentError(null)
    setSyncParentSuccess(false)

    try {
      await gitSyncParent.mutateAsync({
        repoPath: task.repoPath,
        baseBranch: task.baseBranch,
      })
      setSyncParentSuccess(true)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync parent failed'
      setSyncParentError(errorMessage)
      setSyncParentErrorModalOpen(true)
    }
  }

  // Build a prompt for Claude Code for sync parent errors
  const buildSyncParentClaudePrompt = () => {
    if (!task || !syncParentError) return ''
    const baseBranch = task.baseBranch || 'main'
    return `Fix the git sync parent issue. Parent repo: ${task.repoPath} | Base branch: ${baseBranch} | Error: ${syncParentError} | Steps: 1) Check git status in parent repo 2) Resolve any local changes or divergence 3) Fetch and merge/rebase from origin/${baseBranch}`
  }

  // Find the terminal for this task
  const taskTerminal = terminals.find((t) => t.cwd === task?.worktreePath)

  // Send prompt directly (for when Claude Code is already running)
  const handleSendPrompt = () => {
    if (!taskTerminal) return
    const prompt = buildClaudePrompt()
    writeToTerminal(taskTerminal.id, prompt + '\r')
    setSyncErrorModalOpen(false)
  }

  // Launch Claude Code with the prompt
  const handleLaunchClaude = () => {
    if (!taskTerminal) return
    const prompt = buildClaudePrompt().replace(/"/g, '\\"')
    const command = `claude -p "${prompt}" --dangerously-skip-permissions\r`
    writeToTerminal(taskTerminal.id, command)
    setSyncErrorModalOpen(false)
  }

  // Send merge prompt directly (for when Claude Code is already running)
  const handleSendMergePrompt = () => {
    if (!taskTerminal) return
    const prompt = buildMergeClaudePrompt()
    writeToTerminal(taskTerminal.id, prompt + '\r')
    setMergeErrorModalOpen(false)
  }

  // Launch Claude Code with the merge prompt
  const handleLaunchClaudeForMerge = () => {
    if (!taskTerminal) return
    const prompt = buildMergeClaudePrompt().replace(/"/g, '\\"')
    const command = `claude -p "${prompt}" --dangerously-skip-permissions\r`
    writeToTerminal(taskTerminal.id, command)
    setMergeErrorModalOpen(false)
  }

  // Send sync parent prompt directly (for when Claude Code is already running)
  const handleSendSyncParentPrompt = () => {
    if (!taskTerminal) return
    const prompt = buildSyncParentClaudePrompt()
    writeToTerminal(taskTerminal.id, prompt + '\r')
    setSyncParentErrorModalOpen(false)
  }

  // Launch Claude Code with the sync parent prompt
  const handleLaunchClaudeForSyncParent = () => {
    if (!taskTerminal) return
    const prompt = buildSyncParentClaudePrompt().replace(/"/g, '\\"')
    const command = `claude -p "${prompt}" --dangerously-skip-permissions\r`
    writeToTerminal(taskTerminal.id, command)
    setSyncParentErrorModalOpen(false)
  }

  const handleOpenVSCodeModal = () => {
    setVscodeModalOpen(true)
  }

  const handleOpenVSCodeWorktree = () => {
    if (!task?.worktreePath) return
    const url = buildVSCodeUrl(task.worktreePath, hostname, sshPort)
    window.open(url, '_blank')
    setVscodeModalOpen(false)
  }

  const handleOpenVSCodeRepo = () => {
    if (!task?.repoPath) return
    const url = buildVSCodeUrl(task.repoPath, hostname, sshPort)
    window.open(url, '_blank')
    setVscodeModalOpen(false)
  }

  const handleStatusChange = (status: string) => {
    if (task) {
      updateTask.mutate({
        taskId: task.id,
        updates: { status: status as TaskStatus },
      })
    }
  }

  const handleDelete = () => {
    if (task) {
      deleteTask.mutate(task.id, {
        onSuccess: () => {
          navigate({ to: '/tasks' })
        },
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Task Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <h1 className="text-sm font-medium">
              {task.title}
            </h1>
            <button
              type="button"
              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              onClick={() => setConfigModalOpen(true)}
              title="Task settings"
            >
              <HugeiconsIcon icon={Settings05Icon} size={14} strokeWidth={2} />
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{task.repoName}</span>
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
            {task.linearTicketUrl && (
              <>
                <span className="text-muted-foreground/50">•</span>
                <a
                  href={task.linearTicketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-foreground hover:text-primary font-medium"
                  onClick={(e) => e.stopPropagation()}
                  title={linearTicket?.title}
                >
                  <HugeiconsIcon icon={Task01Icon} size={14} strokeWidth={2} />
                  <span>{task.linearTicketId}</span>
                  {linearTicket?.status && (
                    <span className="text-muted-foreground text-xs">({linearTicket.status})</span>
                  )}
                </a>
              </>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className={STATUS_COLORS[task.status]}
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

        {/* Pull from Main Button */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleSync}
          disabled={gitSync.isPending || !task.worktreePath}
          className="text-muted-foreground hover:text-foreground"
          title="Pull from main"
        >
          <HugeiconsIcon
            icon={ArrowDown03Icon}
            size={16}
            strokeWidth={2}
            className={gitSync.isPending ? 'animate-spin' : ''}
          />
        </Button>

        {/* Merge to Main Button */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleMergeToMain}
          disabled={gitMerge.isPending || !task.worktreePath}
          className="text-muted-foreground hover:text-foreground"
          title="Merge to main"
        >
          <HugeiconsIcon
            icon={ArrowUp03Icon}
            size={16}
            strokeWidth={2}
            className={gitMerge.isPending ? 'animate-pulse' : ''}
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

        {/* VS Code Button */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleOpenVSCodeModal}
          className="text-muted-foreground hover:text-foreground"
          title="Open in VS Code"
        >
          <HugeiconsIcon icon={VisualStudioCodeIcon} size={16} strokeWidth={2} />
        </Button>

        {/* Sync Status Feedback */}
        {syncSuccess && (
          <span className="text-xs text-green-600">Synced!</span>
        )}
        {mergeSuccess && (
          <span className="text-xs text-green-600">Merged!</span>
        )}
        {syncParentSuccess && (
          <span className="text-xs text-green-600">Parent synced!</span>
        )}

        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" />
            }
          >
            <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={2} />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Task</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{task.title}", close its terminal, and remove its worktree.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                variant="destructive"
                disabled={deleteTask.isPending}
              >
                {deleteTask.isPending ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
              taskId={task.id}
              taskName={task.title}
              cwd={task.worktreePath}
              aiMode={aiMode}
              description={aiModeDescription}
              startupScript={task.startupScript}
            />
          </TabsContent>

          <TabsContent value="details" className="flex-1 min-h-0">
            <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col">
              <div className="shrink-0 border-b border-border px-2 py-1">
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
                </TabsList>
              </div>

              <TabsContent value="diff" className="flex-1 overflow-hidden">
                <DiffViewer taskId={task.id} worktreePath={task.worktreePath} />
              </TabsContent>

              <TabsContent value="browser" className="flex-1 overflow-hidden">
                <BrowserPreview taskId={task.id} />
              </TabsContent>

              <TabsContent value="files" className="flex-1 overflow-hidden">
                <FilesViewer taskId={task.id} worktreePath={task.worktreePath} />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      ) : (
        <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
          {/* Left: Terminal */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <TaskTerminal
              taskId={task.id}
              taskName={task.title}
              cwd={task.worktreePath}
              aiMode={aiMode}
              description={aiModeDescription}
              startupScript={task.startupScript}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: Diff/Browser Toggle */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col">
              <div className="shrink-0 border-b border-border px-2 py-1">
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
                </TabsList>
              </div>

              <TabsContent value="diff" className="flex-1 overflow-hidden">
                <DiffViewer taskId={task.id} worktreePath={task.worktreePath} />
              </TabsContent>

              <TabsContent value="browser" className="flex-1 overflow-hidden">
                <BrowserPreview taskId={task.id} />
              </TabsContent>

              <TabsContent value="files" className="flex-1 overflow-hidden">
                <FilesViewer taskId={task.id} worktreePath={task.worktreePath} />
              </TabsContent>
            </Tabs>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      {/* Task Config Modal */}
      <TaskConfigModal
        task={task}
        open={configModalOpen}
        onOpenChange={setConfigModalOpen}
      />

      {/* VS Code Modal */}
      <Dialog open={vscodeModalOpen} onOpenChange={setVscodeModalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Open in VS Code</DialogTitle>
            <DialogDescription>
              Choose which folder to open
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-4">
            <Button
              variant="outline"
              className="justify-start font-mono text-sm"
              onClick={handleOpenVSCodeWorktree}
              disabled={!task.worktreePath}
            >
              <HugeiconsIcon icon={GitBranchIcon} size={16} strokeWidth={2} className="mr-2" />
              Worktree
              <span className="ml-auto text-xs text-muted-foreground truncate max-w-32">
                {task.branch}
              </span>
            </Button>
            <Button
              variant="outline"
              className="justify-start font-mono text-sm"
              onClick={handleOpenVSCodeRepo}
              disabled={!task.repoPath}
            >
              <HugeiconsIcon icon={Folder01Icon} size={16} strokeWidth={2} className="mr-2" />
              Repository
              <span className="ml-auto text-xs text-muted-foreground truncate max-w-32">
                {task.repoName}
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sync Error Modal */}
      <Dialog open={syncErrorModalOpen} onOpenChange={setSyncErrorModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Sync Failed</DialogTitle>
            <DialogDescription>
              An error occurred while syncing with upstream.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {syncError}
          </div>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setSyncErrorModalOpen(false)}>
              Close
            </Button>
            <Button
              variant="outline"
              onClick={handleSendPrompt}
              disabled={!taskTerminal}
              title="Send prompt to running Claude Code session"
            >
              Send Prompt
            </Button>
            <Button
              variant="destructive"
              onClick={handleLaunchClaude}
              disabled={!taskTerminal}
              title="Launch Claude Code with -p flag"
            >
              Launch Claude
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Error Modal */}
      <Dialog open={mergeErrorModalOpen} onOpenChange={setMergeErrorModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Merge Failed</DialogTitle>
            <DialogDescription>
              An error occurred while merging to {task?.baseBranch || 'main'}.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {mergeError}
          </div>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setMergeErrorModalOpen(false)}>
              Close
            </Button>
            <Button
              variant="outline"
              onClick={handleSendMergePrompt}
              disabled={!taskTerminal}
              title="Send prompt to running Claude Code session"
            >
              Send Prompt
            </Button>
            <Button
              variant="destructive"
              onClick={handleLaunchClaudeForMerge}
              disabled={!taskTerminal}
              title="Launch Claude Code with -p flag"
            >
              Launch Claude
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sync Parent Error Modal */}
      <Dialog open={syncParentErrorModalOpen} onOpenChange={setSyncParentErrorModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Sync Parent Failed</DialogTitle>
            <DialogDescription>
              An error occurred while syncing the parent repository with origin.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {syncParentError}
          </div>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setSyncParentErrorModalOpen(false)}>
              Close
            </Button>
            <Button
              variant="outline"
              onClick={handleSendSyncParentPrompt}
              disabled={!taskTerminal}
              title="Send prompt to running Claude Code session"
            >
              Send Prompt
            </Button>
            <Button
              variant="destructive"
              onClick={handleLaunchClaudeForSyncParent}
              disabled={!taskTerminal}
              title="Launch Claude Code with -p flag"
            >
              Launch Claude
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
