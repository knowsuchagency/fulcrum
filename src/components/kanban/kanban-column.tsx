import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { TaskCard } from './task-card'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Task, TaskStatus } from '@/types'
import { cn } from '@/lib/utils'

const STATUS_LABELS: Record<TaskStatus, string> = {
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  IN_PROGRESS: 'border-t-blue-500',
  IN_REVIEW: 'border-t-yellow-500',
  DONE: 'border-t-green-500',
  CANCELLED: 'border-t-red-500',
}

interface KanbanColumnProps {
  status: TaskStatus
  tasks: Task[]
}

export function KanbanColumn({ status, tasks }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  const sortedTasks = [...tasks].sort((a, b) => a.position - b.position)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-72 flex-shrink-0 flex-col rounded-lg border border-t-4 bg-card',
        STATUS_COLORS[status],
        isOver && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-sm font-medium">{STATUS_LABELS[status]}</h3>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium">
          {tasks.length}
        </span>
      </div>
      <ScrollArea className="flex-1">
        <SortableContext
          items={sortedTasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2 p-2">
            {sortedTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  )
}
