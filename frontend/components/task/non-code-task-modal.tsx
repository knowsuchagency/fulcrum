import { useNavigate } from '@tanstack/react-router'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { TaskContent } from '@/components/task/task-content'
import type { Task } from '@/types'

interface NonCodeTaskModalProps {
  task: Task
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NonCodeTaskModal({ task, open, onOpenChange }: NonCodeTaskModalProps) {
  const navigate = useNavigate()

  const handleInitializeAsCodeTask = () => {
    onOpenChange(false)
    navigate({ to: '/tasks/$taskId', params: { taskId: task.id } })
  }

  const handleDeleted = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto p-0">
        <div className="pr-8">
          <TaskContent
            task={task}
            onInitializeAsCodeTask={handleInitializeAsCodeTask}
            onDeleted={handleDeleted}
            compact
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
