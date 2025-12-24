import { createFileRoute, Link, useNavigate, useLocation } from '@tanstack/react-router'
import { useState } from 'react'
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
import { useKillClaudeInTask } from '@/hooks/use-kill-claude'
import { useRemoteHost, useSshPort } from '@/hooks/use-config'
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
  GitCommitIcon,
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import type { TaskStatus } from '@/types'
import { useIsMobile } from '@/hooks/use-is-mobile'

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
  const killClaude = useKillClaudeInTask()
  const { data: remoteHost } = useRemoteHost()
  const { data: sshPort } = useSshPort()
  const { data: linearTicket } = useLinearTicket(task?.linearTicketId ?? null)

  // Read AI mode state from navigation (only set when coming from task creation)
  const navState = location.state as { aiMode?: 'default' | 'plan'; description?: string } | undefined
  const aiMode = navState?.aiMode
  const aiModeDescription = navState?.description

  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteLinkedWorktree, setDeleteLinkedWorktree] = useState(false)
  const [vscodeModalOpen, setVscodeModalOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState<'terminal' | 'details'>('terminal')
  const isMobile = useIsMobile()

  // Get terminal functions for sending commands
  const { terminals, sendInputToTerminal } = useTerminalWS()

  // Find the terminal for this task
  const taskTerminal = terminals.find((t) => t.cwd === task?.worktreePath)

  // Send prompt to Claude Code to resolve git issues
  const resolveWithClaude = (prompt: string) => {
    if (taskTerminal) {
      sendInputToTerminal(taskTerminal.id, prompt)
      toast.info('Sent to Claude Code')
    } else {
      toast.error('No terminal available')
    }
  }

  const handleSync = async () => {
    if (!task?.repoPath || !task?.worktreePath) return

    try {
      await gitSync.mutateAsync({
        repoPath: task.repoPath,
        worktreePath: task.worktreePath,
        baseBranch: task.baseBranch,
      })
      toast.success('Synced from main')
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
        baseBranch: task.baseBranch,
      })
      toast.success('Merged to main')
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
            `Merge this worktree's branch into the parent repo's ${branch}. Error: "${errorMessage}". Steps: 1) Ensure all changes in worktree are committed, 2) In parent repo at ${task.repoPath}, checkout ${branch} and pull latest from origin, 3) Merge the worktree branch into ${branch}, 4) Resolve any conflicts carefully - do not lose functionality or introduce regressions, 5) Push ${branch} to origin. Worktree: ${task.worktreePath}, Parent repo: ${task.repoPath}.`
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
        baseBranch: task.baseBranch,
      })
      toast.success('Parent synced with origin')
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

  const handleOpenVSCodeModal = () => {
    setVscodeModalOpen(true)
  }

  const handleOpenVSCodeWorktree = () => {
    if (!task?.worktreePath) return
    const url = buildVSCodeUrl(task.worktreePath, remoteHost, sshPort)
    window.open(url, '_blank')
    setVscodeModalOpen(false)
  }

  const handleOpenVSCodeRepo = () => {
    if (!task?.repoPath) return
    const url = buildVSCodeUrl(task.repoPath, remoteHost, sshPort)
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
      deleteTask.mutate(
        { taskId: task.id, deleteLinkedWorktree },
        {
          onSuccess: () => {
            navigate({ to: '/tasks' })
          },
        }
      )
    }
  }

  const handleDeleteDialogChange = (open: boolean) => {
    setDeleteDialogOpen(open)
    if (!open) {
      setDeleteLinkedWorktree(false)
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
                  href={linearTicket?.url ?? task.linearTicketUrl}
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

        <AlertDialog open={deleteDialogOpen} onOpenChange={handleDeleteDialogChange}>
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
                This will permanently delete "{task.title}" and close its terminal.
                {deleteLinkedWorktree && task.worktreePath && ' The linked worktree will also be removed.'}
                {' '}This action cannot be undone.
              </AlertDialogDescription>
              {task.worktreePath && (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={deleteLinkedWorktree}
                    onCheckedChange={(checked) => setDeleteLinkedWorktree(checked === true)}
                    disabled={deleteTask.isPending}
                  />
                  Also delete linked worktree
                </label>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteTask.isPending}>Cancel</AlertDialogCancel>
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
    </div>
  )
}
