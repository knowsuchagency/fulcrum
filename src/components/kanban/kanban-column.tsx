import { useRef, useEffect, useState } from 'react'
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { TaskCard } from './task-card'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Task, TaskStatus } from '@/types'
import { cn } from '@/lib/utils'

const STATUS_LABELS: Record<TaskStatus, string> = {
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  DONE: 'Done',
  CANCELED: 'Canceled',
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  IN_PROGRESS: 'border-t-slate-400',
  IN_REVIEW: 'border-t-violet-400',
  DONE: 'border-t-emerald-400',
  CANCELED: 'border-t-rose-500',
}

interface KanbanColumnProps {
  status: TaskStatus
  tasks: Task[]
  isMobile?: boolean
}

export function KanbanColumn({ status, tasks, isMobile }: KanbanColumnProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isOver, setIsOver] = useState(false)

  const sortedTasks = [...tasks].sort((a, b) => a.position - b.position)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    return dropTargetForElements({
      element: el,
      getData: () => ({ type: 'column', status }),
      canDrop: ({ source }) => source.data.type === 'task',
      onDragEnter: () => setIsOver(true),
      onDragLeave: () => setIsOver(false),
      onDrop: () => setIsOver(false),
    })
  }, [status])

  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col rounded-lg border border-t-4 bg-card',
        isMobile ? 'h-full w-full' : 'h-full w-72 min-w-52 flex-shrink',
        STATUS_COLORS[status],
        isOver && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
    >
      {!isMobile && (
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <h3 className="text-sm font-medium">{STATUS_LABELS[status]}</h3>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium">
            {tasks.length}
          </span>
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 p-2">
          {sortedTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
