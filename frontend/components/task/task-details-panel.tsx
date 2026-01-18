import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DescriptionTextarea } from '@/components/ui/description-textarea'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import { LinksManager } from '@/components/task/links-manager'
import { DependencyManager } from '@/components/task/dependency-manager'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { useUpdateTask } from '@/hooks/use-tasks'
import type { Task } from '@/types'

interface TaskDetailsPanelProps {
  task: Task
}

export function TaskDetailsPanel({ task }: TaskDetailsPanelProps) {
  const updateTask = useUpdateTask()
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [editedDescription, setEditedDescription] = useState(task.description || '')
  const [labelInput, setLabelInput] = useState('')

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

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-2xl space-y-4">
        {/* Description */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-muted-foreground">Description</h3>
            {!isEditingDescription && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingDescription(true)}
                className="text-xs h-7"
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

        {/* Labels and Due Date */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Labels */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Labels</h3>
            <div className="flex flex-wrap items-center gap-1.5">
              {task.labels.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium"
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
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Due Date</h3>
            <DatePickerPopover
              value={task.dueDate}
              onChange={handleDueDateChange}
              isOverdue={!!isOverdue}
            />
          </div>
        </div>

        {/* Dependencies */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Dependencies</h3>
          <DependencyManager taskId={task.id} />
        </div>

        {/* Links */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Links</h3>
          <LinksManager taskId={task.id} links={task.links || []} />
        </div>
      </div>
    </div>
  )
}
