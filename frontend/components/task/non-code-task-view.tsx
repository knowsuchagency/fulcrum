import { TaskContent } from '@/components/task/task-content'
import type { Task } from '@/types'

interface NonCodeTaskViewProps {
  task: Task
}

export function NonCodeTaskView({ task }: NonCodeTaskViewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TaskContent task={task} />
    </div>
  )
}
