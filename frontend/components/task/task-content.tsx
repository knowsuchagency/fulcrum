import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DescriptionTextarea } from '@/components/ui/description-textarea'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import { LinksManager } from '@/components/task/links-manager'
import { DependencyManager } from '@/components/task/dependency-manager'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Delete02Icon,
  Cancel01Icon,
  Settings05Icon,
} from '@hugeicons/core-free-icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

interface TaskContentProps {
  task: Task
  onInitializeAsCodeTask?: () => void
  onDeleted?: () => void
  /** If true, uses compact styling for modal */
  compact?: boolean
}

export function TaskContent({ task, onInitializeAsCodeTask, onDeleted, compact }: TaskContentProps) {
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

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE' && task.status !== 'CANCELED'

  const paddingClass = compact ? 'p-3' : 'p-4'
  const marginClass = compact ? 'mb-2' : 'mb-3'
  const headingClass = compact ? 'text-xs' : 'text-sm'
  const gapClass = compact ? 'gap-3' : 'gap-4'
  const spaceClass = compact ? 'space-y-4' : 'space-y-6'

  return (
    <>
      {/* Header */}
      <div className={`shrink-0 border-b border-border bg-background px-4 py-3`}>
        <div className="flex items-start justify-between gap-4">
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
                className={compact ? 'text-base font-semibold' : 'text-lg font-semibold'}
                autoFocus
              />
            ) : (
              <h1
                className={`${compact ? 'text-base' : 'text-lg'} font-semibold cursor-pointer hover:text-primary`}
                onClick={() => setIsEditingTitle(true)}
              >
                {task.title}
              </h1>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className={`rounded-full ${compact ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'} font-medium ${STATUS_COLORS[task.status]}`}
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
              <HugeiconsIcon icon={Delete02Icon} size={compact ? 14 : 16} strokeWidth={2} />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={`flex-1 overflow-auto ${compact ? 'p-4' : 'p-6'}`}>
        <div className={`${compact ? '' : 'mx-auto max-w-3xl'} ${spaceClass}`}>
          {/* Description */}
          <div className={`rounded-lg border bg-card ${paddingClass}`}>
            <div className={`flex items-center justify-between ${marginClass}`}>
              <h2 className={`${headingClass} font-medium text-muted-foreground`}>Description</h2>
              {!isEditingDescription && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingDescription(true)}
                  className={compact ? 'text-xs h-6' : 'text-xs'}
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
                  rows={compact ? 4 : 6}
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
                  <p className={`whitespace-pre-wrap ${compact ? 'text-sm' : ''}`}>{task.description}</p>
                ) : (
                  <p className={`text-muted-foreground italic ${compact ? 'text-sm' : ''}`}>No description</p>
                )}
              </div>
            )}
          </div>

          {/* Metadata Grid */}
          <div className={`grid ${gapClass} sm:grid-cols-2`}>
            {/* Labels */}
            <div className={`rounded-lg border bg-card ${paddingClass}`}>
              <h2 className={`${headingClass} font-medium text-muted-foreground ${marginClass}`}>Labels</h2>
              <div className="flex flex-wrap items-center gap-1.5">
                {task.labels.map((label) => (
                  <span
                    key={label}
                    className={`inline-flex items-center gap-1 rounded-full bg-muted ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'} text-xs font-medium`}
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
            <div className={`rounded-lg border bg-card ${paddingClass}`}>
              <h2 className={`${headingClass} font-medium text-muted-foreground ${marginClass}`}>Due Date</h2>
              <DatePickerPopover
                value={task.dueDate}
                onChange={handleDueDateChange}
                isOverdue={!!isOverdue}
              />
            </div>
          </div>

          {/* Dependencies */}
          <div className={`rounded-lg border bg-card ${paddingClass}`}>
            <h2 className={`${headingClass} font-medium text-muted-foreground ${marginClass}`}>Dependencies</h2>
            <DependencyManager taskId={task.id} compact={compact} />
          </div>

          {/* Links */}
          <div className={`rounded-lg border bg-card ${paddingClass}`}>
            <h2 className={`${headingClass} font-medium text-muted-foreground ${marginClass}`}>Links</h2>
            <LinksManager taskId={task.id} links={task.links || []} />
          </div>

          {/* Initialize as Code Task */}
          {onInitializeAsCodeTask && (
            <div className={`rounded-lg border border-dashed bg-muted/30 ${compact ? 'p-4' : 'p-6'} text-center`}>
              <p className={`${compact ? 'text-xs' : 'text-sm'} text-muted-foreground ${compact ? 'mb-3' : 'mb-4'}`}>
                This task doesn't have a code context yet.
              </p>
              <Button size={compact ? 'sm' : 'default'} onClick={onInitializeAsCodeTask}>
                <HugeiconsIcon icon={Settings05Icon} size={compact ? 14 : 16} className={compact ? 'mr-1.5' : 'mr-2'} />
                Initialize as Code Task
              </Button>
              {!compact && (
                <p className="text-xs text-muted-foreground mt-2">
                  Creates a git worktree and opens an AI coding agent.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <DeleteTaskDialog
        task={task}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onDeleted={onDeleted}
      />
    </>
  )
}
