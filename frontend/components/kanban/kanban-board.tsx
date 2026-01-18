import { useState, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { KanbanColumn } from './kanban-column'
import { DragProvider, useDrag } from './drag-context'
import { SelectionProvider, useSelection } from './selection-context'
import { BulkActionsToolbar } from './bulk-actions-toolbar'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTasks, useUpdateTaskStatus, useTaskDependencyGraph } from '@/hooks/use-tasks'
import { cn } from '@/lib/utils'
import { fuzzyScore } from '@/lib/fuzzy-search'
import type { TaskStatus } from '@/types'

const COLUMNS: TaskStatus[] = [
  'TO_DO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
  'CANCELED',
]

// Mobile drop zone for cross-column drag-and-drop
function MobileDropZone({ status }: { status: TaskStatus }) {
  const { t } = useTranslation('common')
  const ref = useRef<HTMLDivElement>(null)
  const [isOver, setIsOver] = useState(false)

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
        'flex-1 rounded-lg border-2 border-dashed px-3 py-2 text-center text-xs font-medium transition-colors',
        isOver
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-muted-foreground/30 text-muted-foreground'
      )}
    >
      {t(`statuses.${status}`)}
    </div>
  )
}

interface KanbanBoardProps {
  repoFilter?: string | null
  searchQuery?: string
}

function KanbanBoardInner({ repoFilter, searchQuery }: KanbanBoardProps) {
  const { t } = useTranslation('common')
  const { data: allTasks = [], isLoading } = useTasks()
  const { data: dependencyGraph } = useTaskDependencyGraph()
  const updateStatus = useUpdateTaskStatus()
  const { activeTask } = useDrag()
  const { clearSelection, selectedIds } = useSelection()
  const [activeTab, setActiveTab] = useState<TaskStatus>('IN_PROGRESS')

  // Compute which tasks are blocked (have incomplete dependencies) and blocking (blocking other tasks)
  const { blockedTaskIds, blockingTaskIds } = useMemo(() => {
    if (!dependencyGraph) return { blockedTaskIds: new Set<string>(), blockingTaskIds: new Set<string>() }

    const blocked = new Set<string>()
    const blocking = new Set<string>()
    const nodeStatusMap = new Map(dependencyGraph.nodes.map(n => [n.id, n.status]))

    // For each edge, check if the source (dependency) is incomplete
    for (const edge of dependencyGraph.edges) {
      const dependencyStatus = nodeStatusMap.get(edge.source)
      // A task is blocked if any of its dependencies are not DONE or CANCELED
      if (dependencyStatus && dependencyStatus !== 'DONE' && dependencyStatus !== 'CANCELED') {
        blocked.add(edge.target)
        blocking.add(edge.source)
      }
    }

    return { blockedTaskIds: blocked, blockingTaskIds: blocking }
  }, [dependencyGraph])

  // Escape key clears selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedIds.size > 0) {
        clearSelection()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clearSelection, selectedIds.size])

  // Filter tasks by repo and search query, sort by latest first
  const tasks = useMemo(() => {
    let filtered = allTasks
    if (repoFilter) {
      filtered = filtered.filter((t) => t.repoName === repoFilter)
    }
    if (searchQuery?.trim()) {
      // When searching, sort by fuzzy score
      filtered = filtered
        .map((t) => ({
          task: t,
          score: Math.max(
            fuzzyScore(t.title, searchQuery),
            fuzzyScore(t.description || '', searchQuery),
            fuzzyScore(t.branch || '', searchQuery),
            fuzzyScore(t.linearTicketId || '', searchQuery),
            fuzzyScore(t.prUrl || '', searchQuery)
          ),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ task }) => task)
    } else {
      // Default sort: most recently updated first
      filtered = [...filtered].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    }
    return filtered
  }, [allTasks, repoFilter, searchQuery])

  // Task counts for tabs
  const taskCounts = useMemo(() => {
    const counts: Record<TaskStatus, number> = {
      TO_DO: 0,
      IN_PROGRESS: 0,
      IN_REVIEW: 0,
      DONE: 0,
      CANCELED: 0,
    }
    for (const task of tasks) {
      counts[task.status]++
    }
    return counts
  }, [tasks])

  // Monitor for all drop events - handles the business logic
  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => source.data.type === 'task',
      onDrop: ({ source, location }) => {
        const dropTargets = location.current.dropTargets
        if (dropTargets.length === 0) return

        const taskId = source.data.taskId as string
        const task = tasks.find(t => t.id === taskId)
        if (!task) return

        // Get the innermost drop target (could be task or column)
        const target = dropTargets[0]
        const targetData = target.data as { type: string; status?: TaskStatus; taskId?: string }

        if (targetData.type === 'column') {
          // Dropped on empty column area
          const newStatus = targetData.status as TaskStatus
          if (newStatus !== task.status) {
            const tasksInColumn = tasks.filter(t => t.status === newStatus)
            updateStatus.mutate({
              taskId,
              status: newStatus,
              position: tasksInColumn.length,
            })
          }
        } else if (targetData.type === 'task') {
          // Dropped on another task - check edge
          const closestEdge = extractClosestEdge(target.data)
          const newStatus = targetData.status as TaskStatus
          const tasksInColumn = tasks
            .filter(t => t.status === newStatus)
            .sort((a, b) => a.position - b.position)

          const targetIndex = tasksInColumn.findIndex(t => t.id === targetData.taskId)
          let newPosition = targetIndex

          if (closestEdge === 'bottom') {
            newPosition = targetIndex + 1
          }

          // Adjust for same-column reordering
          if (task.status === newStatus) {
            const currentIndex = tasksInColumn.findIndex(t => t.id === taskId)
            if (currentIndex < targetIndex) {
              newPosition = Math.max(0, newPosition - 1)
            }
          }

          if (task.status !== newStatus || newPosition !== task.position) {
            updateStatus.mutate({
              taskId,
              status: newStatus,
              position: newPosition,
            })
          }
        }
      },
    })
  }, [tasks, updateStatus])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading tasks...</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Mobile tabs - hidden on desktop */}
      <div className="border-b bg-background lg:hidden">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TaskStatus)}
        >
          <TabsList variant="line" className="w-full justify-start px-4">
            {COLUMNS.map((status) => (
              <TabsTrigger key={status} value={status} className="gap-1.5">
                <span className="truncate">{t(`statuses.${status}`)}</span>
                <span className="text-muted-foreground">
                  {taskCounts[status]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Desktop layout - hidden on mobile */}
      <div className="hidden h-full justify-center gap-4 overflow-x-auto p-4 lg:flex">
        {COLUMNS.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={tasks.filter((t) => t.status === status)}
            blockedTaskIds={blockedTaskIds}
            blockingTaskIds={blockingTaskIds}
          />
        ))}
      </div>

      {/* Mobile single column */}
      <div className="flex-1 overflow-y-auto p-4 lg:hidden">
        <KanbanColumn
          status={activeTab}
          tasks={tasks.filter((t) => t.status === activeTab)}
          isMobile
          blockedTaskIds={blockedTaskIds}
          blockingTaskIds={blockingTaskIds}
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

      {/* Bulk actions toolbar - shown when tasks are selected */}
      <BulkActionsToolbar />
    </div>
  )
}

export function KanbanBoard(props: KanbanBoardProps) {
  return (
    <SelectionProvider>
      <DragProvider>
        <KanbanBoardInner {...props} />
      </DragProvider>
    </SelectionProvider>
  )
}
