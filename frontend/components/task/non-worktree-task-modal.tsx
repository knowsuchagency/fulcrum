import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { TaskContent } from '@/components/task/task-content'
import type { Task } from '@/types'

interface NonWorktreeTaskModalProps {
  task: Task
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NonWorktreeTaskModal({ task, open, onOpenChange }: NonWorktreeTaskModalProps) {
  const handleDeleted = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto p-0" showCloseButton={false}>
        <TaskContent
          task={task}
          onDeleted={handleDeleted}
          compact
        />
      </DialogContent>
    </Dialog>
  )
}
