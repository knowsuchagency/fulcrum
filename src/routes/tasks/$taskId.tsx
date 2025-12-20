import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { useTask, useUpdateTask, useDeleteTask } from '@/hooks/use-tasks'
import { useTaskTab } from '@/hooks/use-task-tab'
import { TaskTerminal } from '@/components/terminal/task-terminal'
import { DiffViewer } from '@/components/viewer/diff-viewer'
import { BrowserPreview } from '@/components/viewer/browser-preview'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CodeIcon,
  BrowserIcon,
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
          <h1 className="text-sm font-medium">{task.title}</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{task.repoName}</span>
            <HugeiconsIcon icon={GitBranchIcon} size={12} strokeWidth={2} />
            <span className="font-mono">{task.branch}</span>
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
              </TabsList>
            </div>

            <TabsContent value="diff" className="flex-1 overflow-hidden">
              <DiffViewer worktreePath={task.worktreePath} />
            </TabsContent>

            <TabsContent value="browser" className="flex-1 overflow-hidden">
              <BrowserPreview taskId={task.id} />
            </TabsContent>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
