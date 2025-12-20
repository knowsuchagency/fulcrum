import { useState, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  type CollisionDetection,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { KanbanColumn } from './kanban-column'
import { TaskCard } from './task-card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTasks, useUpdateTaskStatus } from '@/hooks/use-tasks'
import { cn } from '@/lib/utils'
import type { Task, TaskStatus } from '@/types'

const COLUMNS: TaskStatus[] = [
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
  'CANCELLED',
]

const STATUS_LABELS: Record<TaskStatus, string> = {
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
}

// Mobile drop zone for cross-column drag-and-drop
function MobileDropZone({ status }: { status: TaskStatus }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-1 rounded-lg border-2 border-dashed px-3 py-2 text-center text-xs font-medium transition-colors',
        isOver
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-muted-foreground/30 text-muted-foreground'
      )}
    >
      {STATUS_LABELS[status]}
    </div>
  )
}

// Custom collision detection that prefers columns over tasks
const customCollisionDetection: CollisionDetection = (args) => {
  // First check pointer intersection
  const pointerCollisions = pointerWithin(args)

  // If we have collisions, prefer column over task
  if (pointerCollisions.length > 0) {
    // Check if any collision is a column
    const columnCollision = pointerCollisions.find((c) =>
      COLUMNS.includes(c.id as TaskStatus)
    )
    if (columnCollision) {
      return [columnCollision]
    }
    return pointerCollisions
  }

  // Fall back to rect intersection for edge cases
  return rectIntersection(args)
}

interface KanbanBoardProps {
  repoFilter?: string | null
}

export function KanbanBoard({ repoFilter }: KanbanBoardProps) {
  const { data: allTasks = [], isLoading } = useTasks()

  // Filter tasks by repo if filter is set
  const tasks = useMemo(() => {
    if (!repoFilter) return allTasks
    return allTasks.filter((t) => t.repoName === repoFilter)
  }, [allTasks, repoFilter])
  const updateStatus = useUpdateTaskStatus()
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [activeTab, setActiveTab] = useState<TaskStatus>('IN_PROGRESS')

  // Task counts for tabs
  const taskCounts = useMemo(() => {
    const counts: Record<TaskStatus, number> = {
      IN_PROGRESS: 0,
      IN_REVIEW: 0,
      DONE: 0,
      CANCELLED: 0,
    }
    for (const task of tasks) {
      counts[task.status]++
    }
    return counts
  }, [tasks])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id)
    if (task) setActiveTask(task)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)

    if (!over) return

    const taskId = active.id as string
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    const overId = over.id as string

    // Check if dropped on a column
    if (COLUMNS.includes(overId as TaskStatus)) {
      const newStatus = overId as TaskStatus
      if (newStatus !== task.status) {
        const tasksInColumn = tasks.filter((t) => t.status === newStatus)
        updateStatus.mutate({
          taskId,
          status: newStatus,
          position: tasksInColumn.length,
        })
      }
      return
    }

    // Check if dropped on another task
    const overTask = tasks.find((t) => t.id === overId)
    if (overTask) {
      const newStatus = overTask.status
      const tasksInColumn = tasks
        .filter((t) => t.status === newStatus)
        .sort((a, b) => a.position - b.position)

      if (newStatus === task.status) {
        // Reordering within same column
        const oldIndex = tasksInColumn.findIndex((t) => t.id === taskId)
        const newIndex = tasksInColumn.findIndex((t) => t.id === overId)
        if (oldIndex !== newIndex) {
          updateStatus.mutate({
            taskId,
            status: newStatus,
            position: newIndex,
          })
        }
      } else {
        // Moving to different column at specific position
        const newIndex = tasksInColumn.findIndex((t) => t.id === overId)
        updateStatus.mutate({
          taskId,
          status: newStatus,
          position: newIndex,
        })
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading tasks...</p>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full flex-col">
        {/* Mobile tabs - hidden on desktop */}
        <div className="border-b lg:hidden">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TaskStatus)}
          >
            <TabsList variant="line" className="w-full justify-start px-4">
              {COLUMNS.map((status) => (
                <TabsTrigger key={status} value={status} className="gap-1.5">
                  <span className="truncate">{STATUS_LABELS[status]}</span>
                  <span className="text-muted-foreground">
                    {taskCounts[status]}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Desktop layout - hidden on mobile */}
        <div className="pixel-grid hidden h-full justify-center gap-4 overflow-x-auto p-4 lg:flex">
          {COLUMNS.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={tasks.filter((t) => t.status === status)}
            />
          ))}
        </div>

        {/* Mobile single column */}
        <div className="pixel-grid flex-1 overflow-y-auto p-4 lg:hidden">
          <KanbanColumn
            status={activeTab}
            tasks={tasks.filter((t) => t.status === activeTab)}
            isMobile
          />
        </div>

        {/* Mobile drop zones - shown during drag */}
        {activeTask && (
          <div className="fixed inset-x-0 bottom-0 flex gap-2 border-t bg-background/95 p-4 backdrop-blur-sm lg:hidden">
            {COLUMNS.filter((s) => s !== activeTab).map((status) => (
              <MobileDropZone key={status} status={status} />
            ))}
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}
