import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { DescriptionTextarea } from '@/components/ui/description-textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { DeleteTaskDialog } from '@/components/delete-task-dialog'
import { useUpdateTask, usePinTask, useAddTaskLink, useRemoveTaskLink } from '@/hooks/use-tasks'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, Add01Icon, Link01Icon } from '@hugeicons/core-free-icons'
import type { Task } from '@/types'

interface TaskConfigModalProps {
  task: Task
  open: boolean
  onOpenChange: (open: boolean) => void
}

function parseLinearUrl(url: string): string | null {
  const match = url.match(/\/issue\/([A-Z]+-\d+)/i)
  return match?.[1] ?? null
}

export function TaskConfigModal({ task, open, onOpenChange }: TaskConfigModalProps) {
  const updateTask = useUpdateTask()
  const pinTask = usePinTask()
  const addTaskLink = useAddTaskLink()
  const removeTaskLink = useRemoveTaskLink()

  const [title, setTitle] = useState(task.title)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [description, setDescription] = useState(task.description || '')
  const [prUrl, setPrUrl] = useState(task.prUrl || '')
  const [linearUrl, setLinearUrl] = useState(task.linearTicketUrl || '')
  const [newLinkUrl, setNewLinkUrl] = useState('')

  // Reset form when task changes or modal opens
  useEffect(() => {
    if (open) {
      setTitle(task.title)
      setDescription(task.description || '')
      setPrUrl(task.prUrl || '')
      setLinearUrl(task.linearTicketUrl || '')
      setNewLinkUrl('')
      setDeleteDialogOpen(false)
    }
  }, [open, task])

  const handleAddLink = () => {
    const url = newLinkUrl.trim()
    if (!url) return
    addTaskLink.mutate({ taskId: task.id, url })
    setNewLinkUrl('')
  }

  const handleRemoveLink = (linkId: string) => {
    removeTaskLink.mutate({ taskId: task.id, linkId })
  }

  const handleSave = () => {
    const updates: Parameters<typeof updateTask.mutate>[0]['updates'] = {}

    const trimmedTitle = title.trim()
    if (!trimmedTitle) return

    if (trimmedTitle !== task.title) {
      updates.title = trimmedTitle
    }

    const trimmedDescription = description.trim()
    if (trimmedDescription !== (task.description || '')) {
      updates.description = trimmedDescription
    }

    const trimmedPrUrl = prUrl.trim()
    if (trimmedPrUrl !== (task.prUrl || '')) {
      updates.prUrl = trimmedPrUrl || null
    }

    const trimmedLinearUrl = linearUrl.trim()
    if (trimmedLinearUrl !== (task.linearTicketUrl || '')) {
      updates.linearTicketUrl = trimmedLinearUrl || null
      updates.linearTicketId = trimmedLinearUrl ? parseLinearUrl(trimmedLinearUrl) : null
    }

    if (Object.keys(updates).length > 0) {
      updateTask.mutate({ taskId: task.id, updates })
    }

    onOpenChange(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSave()
    }
  }

  const handleTogglePin = () => {
    pinTask.mutate({ taskId: task.id, pinned: !task.pinned })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Task Settings</DialogTitle>
        </DialogHeader>
        <FieldGroup className="mt-4">
          <Field>
            <FieldLabel htmlFor="config-title">Title</FieldLabel>
            <Input
              id="config-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="config-description">Description</FieldLabel>
            <DescriptionTextarea
              id="config-description"
              value={description}
              onValueChange={setDescription}
              rows={3}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="config-pr-url">GitHub PR URL</FieldLabel>
            <Input
              id="config-pr-url"
              value={prUrl}
              onChange={(e) => setPrUrl(e.target.value)}
              placeholder="https://github.com/owner/repo/pull/123"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="config-linear-url">Linear Ticket URL</FieldLabel>
            <Input
              id="config-linear-url"
              value={linearUrl}
              onChange={(e) => setLinearUrl(e.target.value)}
              placeholder="https://linear.app/team/issue/TEAM-123"
            />
          </Field>
          <Field>
            <FieldLabel>Additional Links</FieldLabel>
            {task.links && task.links.length > 0 && (
              <div className="flex flex-col gap-1 mb-2">
                {task.links.map((link) => (
                  <div key={link.id} className="flex items-center gap-2 text-sm group">
                    <HugeiconsIcon icon={Link01Icon} size={14} className="text-muted-foreground shrink-0" />
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground hover:text-primary truncate flex-1"
                      title={link.url}
                    >
                      {link.label || link.url}
                    </a>
                    <button
                      type="button"
                      onClick={() => handleRemoveLink(link.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-0.5"
                      title="Remove link"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="https://..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddLink()
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleAddLink}
                disabled={!newLinkUrl.trim() || addTaskLink.isPending}
              >
                <HugeiconsIcon icon={Add01Icon} size={16} />
              </Button>
            </div>
          </Field>
          <div className="flex items-center gap-2 pt-2">
            <Checkbox
              id="config-pinned"
              checked={task.pinned}
              onCheckedChange={handleTogglePin}
              disabled={pinTask.isPending}
            />
            <label htmlFor="config-pinned" className="text-sm cursor-pointer">
              Pin worktree (exclude from bulk cleanup)
            </label>
          </div>
        </FieldGroup>
        <DialogFooter className="mt-4 flex-row justify-between sm:justify-between">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteDialogOpen(true)}
          >
            Delete Task
          </Button>
          <DeleteTaskDialog
            task={task}
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            onDeleted={() => onOpenChange(false)}
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!title.trim()}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
