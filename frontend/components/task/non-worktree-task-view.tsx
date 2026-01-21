import { TaskContent } from '@/components/task/task-content'
import type { Task } from '@/types'

interface NonWorktreeTaskViewProps {
  task: Task
}

export function NonWorktreeTaskView({ task }: NonWorktreeTaskViewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TaskContent task={task} />
    </div>
  )
}
