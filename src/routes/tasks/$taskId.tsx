import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
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
import { useHostname, useSshPort } from '@/hooks/use-config'
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
  RefreshIcon,
  VisualStudioCodeIcon,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { TaskStatus } from '@/types'

export const Route = createFileRoute('/tasks/$taskId')({
  component: TaskView,
})

const STATUS_LABELS: Record<TaskStatus, string> = {
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  IN_PROGRESS: 'bg-blue-500/20 text-blue-500',
  IN_REVIEW: 'bg-yellow-500/20 text-yellow-600',
  DONE: 'bg-green-500/20 text-green-600',
  CANCELLED: 'bg-red-500/20 text-red-500',
}

function TaskView() {
  const { taskId } = Route.useParams()
  const navigate = useNavigate()
  const { data: task, isLoading } = useTask(taskId)
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const { tab, setTab } = useTaskTab(taskId)
  const gitSync = useGitSync()
  const { data: hostname } = useHostname()
  const { data: sshPort } = useSshPort()

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncErrorModalOpen, setSyncErrorModalOpen] = useState(false)
  const [syncSuccess, setSyncSuccess] = useState(false)
  const [vscodeModalOpen, setVscodeModalOpen] = useState(false)

  // Get terminal functions for sending commands
  const { terminals, writeToTerminal } = useTerminalWS()

  // Auto-clear sync success message
  useEffect(() => {
    if (syncSuccess) {
      const timer = setTimeout(() => setSyncSuccess(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [syncSuccess])

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
    return `Fix the git sync issue. Worktree: ${task.worktreePath} | Parent repo: ${task.repoPath} | Branch: ${task.branch} | Base: ${baseBranch} | Error: ${syncError} | Steps: 1) Check git status 2) Resolve conflicts or commit/stash changes 3) Pull and rebase from origin/${baseBranch}`
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

  const handleOpenEditModal = () => {
    if (task) {
      setEditTitle(task.title)
      setEditDescription(task.description || '')
      setEditModalOpen(true)
    }
  }

  const handleSaveEdit = () => {
    const trimmedTitle = editTitle.trim()
    if (!trimmedTitle || !task) return

    const updates: { title?: string; description?: string } = {}
    if (trimmedTitle !== task.title) {
      updates.title = trimmedTitle
    }
    if (editDescription.trim() !== (task.description || '')) {
      updates.description = editDescription.trim()
    }

    if (Object.keys(updates).length > 0) {
      updateTask.mutate({
        taskId: task.id,
        updates,
      })
    }
    setEditModalOpen(false)
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
    <div className="flex h-full flex-col">
      {/* Task Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
        <div className="flex-1">
          <h1
            className="cursor-pointer text-sm font-medium hover:text-primary"
            onClick={handleOpenEditModal}
            title="Click to edit"
          >
            {task.title}
          </h1>
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

        {/* Sync Button */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleSync}
          disabled={gitSync.isPending || !task.worktreePath}
          className="text-muted-foreground hover:text-foreground"
          title="Sync with upstream"
        >
          <HugeiconsIcon
            icon={RefreshIcon}
            size={16}
            strokeWidth={2}
            className={gitSync.isPending ? 'animate-spin' : ''}
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

      {/* Split Pane Content */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left: Terminal */}
        <ResizablePanel defaultSize={50} minSize={30}>
          <TaskTerminal
            taskId={task.id}
            taskName={task.title}
            cwd={task.worktreePath}
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

      {/* Edit Task Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          <FieldGroup className="mt-4">
            <Field>
              <FieldLabel htmlFor="edit-title">Title</FieldLabel>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSaveEdit()
                  }
                }}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-description">Description</FieldLabel>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={!editTitle.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
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
    </div>
  )
}
