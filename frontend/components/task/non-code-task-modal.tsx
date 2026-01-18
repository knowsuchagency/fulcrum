import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DescriptionTextarea } from '@/components/ui/description-textarea'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import { LinksManager } from '@/components/task/links-manager'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Delete02Icon,
  Cancel01Icon,
  Settings05Icon,
} from '@hugeicons/core-free-icons'
import { useUpdateTask } from '@/hooks/use-tasks'
import { DeleteTaskDialog } from '@/components/delete-task-dialog'
import type { Task, TaskStatus } from '@/types'

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

interface NonCodeTaskModalProps {
  task: Task
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NonCodeTaskModal({ task, open, onOpenChange }: NonCodeTaskModalProps) {
  const navigate = useNavigate()
  const updateTask = useUpdateTask()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState(task.title)
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [editedDescription, setEditedDescription] = useState(task.description || '')
  const [labelInput, setLabelInput] = useState('')

  const handleStatusChange = (status: string) => {
    updateTask.mutate({
      taskId: task.id,
      updates: { status: status as TaskStatus },
    })
  }

  const handleSaveTitle = () => {
    if (editedTitle.trim() && editedTitle !== task.title) {
      updateTask.mutate({
        taskId: task.id,
        updates: { title: editedTitle.trim() },
      })
    }
    setIsEditingTitle(false)
  }

  const handleSaveDescription = () => {
    if (editedDescription !== (task.description || '')) {
      updateTask.mutate({
        taskId: task.id,
        updates: { description: editedDescription || null },
      })
    }
    setIsEditingDescription(false)
  }

  const handleDueDateChange = (date: string | null) => {
    updateTask.mutate({
      taskId: task.id,
      updates: { dueDate: date } as Partial<Task>,
    })
  }

  const handleAddLabel = () => {
    const trimmed = labelInput.trim().toLowerCase()
    if (trimmed && !task.labels.includes(trimmed)) {
      updateTask.mutate({
        taskId: task.id,
        updates: { labels: [...task.labels, trimmed] } as Partial<Task>,
      })
      setLabelInput('')
    }
  }

  const handleRemoveLabel = (label: string) => {
    updateTask.mutate({
      taskId: task.id,
      updates: { labels: task.labels.filter((l) => l !== label) } as Partial<Task>,
    })
  }

  const handleLabelKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddLabel()
    }
  }

  const handleInitializeAsCodeTask = () => {
    onOpenChange(false)
    navigate({ to: '/tasks/$taskId', params: { taskId: task.id } })
  }

  const handleDeleted = () => {
    onOpenChange(false)
  }

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE' && task.status !== 'CANCELED'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto p-0">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
            <div className="flex items-start justify-between gap-4 pr-8">
              <div className="flex-1 min-w-0">
                {isEditingTitle ? (
                  <Input
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onBlur={handleSaveTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle()
                      if (e.key === 'Escape') {
                        setEditedTitle(task.title)
                        setIsEditingTitle(false)
                      }
                    }}
                    className="text-base font-semibold"
                    autoFocus
                  />
                ) : (
                  <h2
                    className="text-base font-semibold cursor-pointer hover:text-primary"
                    onClick={() => setIsEditingTitle(true)}
                  >
                    {task.title}
                  </h2>
                )}
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[task.status]}`}
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
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
                </Button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Description */}
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground">Description</h3>
                {!isEditingDescription && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingDescription(true)}
                    className="text-xs h-6"
                  >
                    Edit
                  </Button>
                )}
              </div>
              {isEditingDescription ? (
                <div className="space-y-2">
                  <DescriptionTextarea
                    value={editedDescription}
                    onValueChange={setEditedDescription}
                    placeholder="Add a description..."
                    rows={4}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditedDescription(task.description || '')
                        setIsEditingDescription(false)
                      }}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveDescription}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {task.description ? (
                    <p className="whitespace-pre-wrap text-sm">{task.description}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No description</p>
                  )}
                </div>
              )}
            </div>

            {/* Metadata Grid */}
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Labels */}
              <div className="rounded-lg border bg-card p-3">
                <h3 className="text-xs font-medium text-muted-foreground mb-2">Labels</h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  {task.labels.map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
                    >
                      {label}
                      <button
                        type="button"
                        onClick={() => handleRemoveLabel(label)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={10} />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={labelInput}
                    onChange={(e) => setLabelInput(e.target.value)}
                    onKeyDown={handleLabelKeyDown}
                    onBlur={handleAddLabel}
                    placeholder={task.labels.length === 0 ? 'Add label...' : '+'}
                    className="w-16 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </div>

              {/* Due Date */}
              <div className="rounded-lg border bg-card p-3">
                <h3 className="text-xs font-medium text-muted-foreground mb-2">Due Date</h3>
                <DatePickerPopover
                  value={task.dueDate}
                  onChange={handleDueDateChange}
                  isOverdue={!!isOverdue}
                />
              </div>
            </div>

            {/* Links */}
            <div className="rounded-lg border bg-card p-3">
              <h3 className="text-xs font-medium text-muted-foreground mb-2">Links</h3>
              <LinksManager taskId={task.id} links={task.links || []} />
            </div>

            {/* Initialize as Code Task */}
            <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center">
              <p className="text-xs text-muted-foreground mb-3">
                This task doesn't have a code context yet.
              </p>
              <Button size="sm" onClick={handleInitializeAsCodeTask}>
                <HugeiconsIcon icon={Settings05Icon} size={14} className="mr-1.5" />
                Initialize as Code Task
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteTaskDialog
        task={task}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onDeleted={handleDeleted}
      />
    </>
  )
}
