import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
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
import { useProjects } from '@/hooks/use-projects'
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
  projectFilter?: string | null // 'inbox' for tasks without project, or project ID
  searchQuery?: string
  tagsFilter?: string[]
}

function KanbanBoardInner({ projectFilter, searchQuery, tagsFilter }: KanbanBoardProps) {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const { data: allTasks = [], isLoading } = useTasks()
  const { data: projects = [] } = useProjects()
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

  // Build sets of all repository IDs and paths that belong to projects (for inbox filtering)
  const { projectRepoIds, projectRepoPaths } = useMemo(() => {
    const ids = new Set<string>()
    const paths = new Set<string>()
    for (const project of projects) {
      for (const repo of project.repositories) {
        ids.add(repo.id)
        paths.add(repo.path)
      }
    }
    return { projectRepoIds: ids, projectRepoPaths: paths }
  }, [projects])

  // Get repository IDs and paths for the selected project filter
  const { selectedProjectRepoIds, selectedProjectRepoPaths } = useMemo(() => {
    if (!projectFilter || projectFilter === 'inbox') {
      return { selectedProjectRepoIds: new Set<string>(), selectedProjectRepoPaths: new Set<string>() }
    }
    const project = projects.find((p) => p.id === projectFilter)
    if (!project) {
      return { selectedProjectRepoIds: new Set<string>(), selectedProjectRepoPaths: new Set<string>() }
    }
    return {
      selectedProjectRepoIds: new Set(project.repositories.map((r) => r.id)),
      selectedProjectRepoPaths: new Set(project.repositories.map((r) => r.path)),
    }
  }, [projectFilter, projects])

  // Filter tasks by project, tags, and search query, sort by latest first
  const tasks = useMemo(() => {
    let filtered = allTasks

    // Filter by project
    if (projectFilter === 'inbox') {
      // Show only tasks without a project (neither directly via projectId nor via repository ID/path)
      filtered = filtered.filter(
        (t) =>
          !t.projectId &&
          (!t.repositoryId || !projectRepoIds.has(t.repositoryId)) &&
          (!t.repoPath || !projectRepoPaths.has(t.repoPath))
      )
    } else if (projectFilter) {
      // Show tasks for a specific project (either directly via projectId or via repository ID/path)
      filtered = filtered.filter(
        (t) =>
          t.projectId === projectFilter ||
          (t.repositoryId && selectedProjectRepoIds.has(t.repositoryId)) ||
          (t.repoPath && selectedProjectRepoPaths.has(t.repoPath))
      )
    }

    // Filter by tags (OR logic - show tasks with ANY selected tag)
    if (tagsFilter && tagsFilter.length > 0) {
      filtered = filtered.filter((t) =>
        t.tags.some((tag) => tagsFilter.includes(tag))
      )
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
            fuzzyScore(t.prUrl || '', searchQuery),
            fuzzyScore(t.tags.join(' '), searchQuery)
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
  }, [allTasks, projectFilter, searchQuery, tagsFilter, projectRepoIds, projectRepoPaths, selectedProjectRepoIds, selectedProjectRepoPaths])

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

        // Helper to check if we should navigate after status change
        // (TO_DO → IN_PROGRESS for code tasks that will create a worktree)
        const shouldNavigateAfterStatusChange = (newStatus: TaskStatus) => {
          const isCodeTask = !!(task.repositoryId || task.repoPath)
          return task.status === 'TO_DO' && newStatus === 'IN_PROGRESS' && isCodeTask
        }

        // Helper to create onSuccess callback for navigation
        const createOnSuccess = (newStatus: TaskStatus) => {
          if (shouldNavigateAfterStatusChange(newStatus)) {
            return () => {
              navigate({
                to: '/tasks/$taskId',
                params: { taskId },
                state: { focusTerminal: true } as Record<string, unknown>,
              })
            }
          }
          return undefined
        }

        if (targetData.type === 'column') {
          // Dropped on empty column area
          const newStatus = targetData.status as TaskStatus
          if (newStatus !== task.status) {
            const tasksInColumn = tasks.filter(t => t.status === newStatus)
            updateStatus.mutate(
              {
                taskId,
                status: newStatus,
                position: tasksInColumn.length,
              },
              { onSuccess: createOnSuccess(newStatus) }
            )
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
            updateStatus.mutate(
              {
                taskId,
                status: newStatus,
                position: newPosition,
              },
              { onSuccess: createOnSuccess(newStatus) }
            )
          }
        }
      },
    })
  }, [tasks, updateStatus, navigate])

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
