import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { DescriptionTextarea } from '@/components/ui/description-textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { useUpdateTask, useDeleteTask } from '@/hooks/use-tasks'
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
  const deleteTask = useDeleteTask()

  const [title, setTitle] = useState(task.title)
  const [deleteLinkedWorktree, setDeleteLinkedWorktree] = useState(true)
  const [description, setDescription] = useState(task.description || '')
  const [prUrl, setPrUrl] = useState(task.prUrl || '')
  const [linearUrl, setLinearUrl] = useState(task.linearTicketUrl || '')

  // Reset form when task changes or modal opens
  useEffect(() => {
    if (open) {
      setTitle(task.title)
      setDescription(task.description || '')
      setPrUrl(task.prUrl || '')
      setLinearUrl(task.linearTicketUrl || '')
      setDeleteLinkedWorktree(true)
    }
  }, [open, task])

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

  const handleDelete = () => {
    deleteTask.mutate(
      { taskId: task.id, deleteLinkedWorktree },
      {
        onSuccess: () => {
          onOpenChange(false)
        },
      }
    )
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
        </FieldGroup>
        <DialogFooter className="mt-4 flex-row justify-between sm:justify-between">
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={deleteTask.isPending} />}
            >
              {deleteTask.isPending ? 'Deleting...' : 'Delete Task'}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Task</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this task. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex items-center gap-2 py-2">
                <Checkbox
                  id="delete-worktree"
                  checked={deleteLinkedWorktree}
                  onCheckedChange={(checked) => setDeleteLinkedWorktree(checked === true)}
                />
                <label htmlFor="delete-worktree" className="text-sm cursor-pointer">
                  Also delete linked worktree
                </label>
              </div>
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
