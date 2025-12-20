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
  type DragEndEvent,
  type DragStartEvent,
  type CollisionDetection,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { KanbanColumn } from './kanban-column'
import { TaskCard } from './task-card'
import { useTasks, useUpdateTaskStatus } from '@/hooks/use-tasks'
import type { Task, TaskStatus } from '@/types'

const COLUMNS: TaskStatus[] = [
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
  'CANCELLED',
]

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
      <div className="pixel-grid flex h-full justify-center gap-4 overflow-x-auto p-4">
        {COLUMNS.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={tasks.filter((t) => t.status === status)}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}
