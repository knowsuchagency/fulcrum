import { TaskContent } from '@/components/task/task-content'
import type { Task } from '@/types'

interface NonCodeTaskViewProps {
  task: Task
  onInitializeAsCodeTask: () => void
}

export function NonCodeTaskView({ task, onInitializeAsCodeTask }: NonCodeTaskViewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TaskContent
        task={task}
        onInitializeAsCodeTask={onInitializeAsCodeTask}
      />
    </div>
  )
}
