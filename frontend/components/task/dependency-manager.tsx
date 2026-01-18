import { useState, useMemo, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, Add01Icon, ArrowUp01Icon, ArrowDown01Icon } from '@hugeicons/core-free-icons'
import {
  useTasks,
  useTaskDependencies,
  useAddTaskDependency,
  useRemoveTaskDependency,
  type TaskDependencyInfo,
} from '@/hooks/use-tasks'
import type { TaskStatus } from '@/types'
import { cn } from '@/lib/utils'

const STATUS_COLORS: Record<TaskStatus, string> = {
  TO_DO: 'bg-status-todo/20 text-status-todo',
  IN_PROGRESS: 'bg-status-in-progress/20 text-status-in-progress',
  IN_REVIEW: 'bg-status-in-review/20 text-status-in-review',
  DONE: 'bg-status-done/20 text-status-done',
  CANCELED: 'bg-status-canceled/20 text-status-canceled',
}

interface DependencyManagerProps {
  taskId: string
  compact?: boolean
}

export function DependencyManager({ taskId, compact }: DependencyManagerProps) {
  const { data: allTasks = [] } = useTasks()
  const { data: dependencies, isLoading } = useTaskDependencies(taskId)
  const addDependency = useAddTaskDependency()
  const removeDependency = useRemoveTaskDependency()

  const [searchQuery, setSearchQuery] = useState('')
  const [isAddingBlockedBy, setIsAddingBlockedBy] = useState(false)
  const [isAddingBlocking, setIsAddingBlocking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when opening add mode
  useEffect(() => {
    if ((isAddingBlockedBy || isAddingBlocking) && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isAddingBlockedBy, isAddingBlocking])

  // Get IDs of tasks already in dependencies
  const existingDependencyIds = useMemo(() => {
    const ids = new Set<string>([taskId])
    if (dependencies) {
      for (const dep of dependencies.blockedBy) {
        ids.add(dep.id)
      }
      for (const dep of dependencies.blocking) {
        ids.add(dep.id)
      }
    }
    return ids
  }, [taskId, dependencies])

  // Filter available tasks for adding - prioritize incomplete tasks
  const filteredTasks = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    const completedStatuses = new Set(['DONE', 'CANCELED'])

    return allTasks
      .filter((task) => !existingDependencyIds.has(task.id))
      .filter((task) => {
        if (!query) return true
        return (
          task.title.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query)
        )
      })
      // Sort: incomplete tasks first, then by most recently updated
      .sort((a, b) => {
        const aComplete = completedStatuses.has(a.status)
        const bComplete = completedStatuses.has(b.status)
        if (aComplete !== bComplete) {
          return aComplete ? 1 : -1 // Incomplete tasks first
        }
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
      .slice(0, 10) // Limit to 10 results
  }, [allTasks, existingDependencyIds, searchQuery])

  const handleAddBlockedBy = (dependsOnTaskId: string) => {
    addDependency.mutate(
      { taskId, dependsOnTaskId },
      {
        onSuccess: () => {
          setSearchQuery('')
          setIsAddingBlockedBy(false)
        },
      }
    )
  }

  const handleAddBlocking = (blockedTaskId: string) => {
    // To make taskId block blockedTaskId, we create a dependency where blockedTaskId depends on taskId
    addDependency.mutate(
      { taskId: blockedTaskId, dependsOnTaskId: taskId },
      {
        onSuccess: () => {
          setSearchQuery('')
          setIsAddingBlocking(false)
        },
      }
    )
  }

  const handleRemove = (dep: TaskDependencyInfo) => {
    removeDependency.mutate({ taskId, dependencyId: dep.dependencyId })
  }

  const handleCancel = () => {
    setSearchQuery('')
    setIsAddingBlockedBy(false)
    setIsAddingBlocking(false)
  }

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">Loading dependencies...</div>
    )
  }

  const blockedBy = dependencies?.blockedBy ?? []
  const blocking = dependencies?.blocking ?? []

  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      {/* Blocked By Section */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <HugeiconsIcon icon={ArrowUp01Icon} size={12} />
            <span>Blocked by</span>
            {blockedBy.length > 0 && (
              <span className="text-amber-600">({blockedBy.length})</span>
            )}
          </div>
          {!isAddingBlockedBy && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                setIsAddingBlocking(false)
                setIsAddingBlockedBy(true)
              }}
            >
              <HugeiconsIcon icon={Add01Icon} size={12} />
            </Button>
          )}
        </div>

        {isAddingBlockedBy && (
          <div className="mb-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Input
                ref={inputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className="h-7 text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') handleCancel()
                }}
              />
              <Button variant="ghost" size="icon-xs" onClick={handleCancel}>
                <HugeiconsIcon icon={Cancel01Icon} size={12} />
              </Button>
            </div>
            {filteredTasks.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded border bg-background">
                {filteredTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="w-full px-2 py-1.5 text-left text-xs hover:bg-muted flex items-center gap-2"
                    onClick={() => handleAddBlockedBy(task.id)}
                  >
                    <span className={cn('shrink-0 rounded px-1 py-0.5 text-[10px]', STATUS_COLORS[task.status])}>
                      {task.status.replace('_', ' ')}
                    </span>
                    <span className="truncate">{task.title}</span>
                  </button>
                ))}
              </div>
            )}
            {searchQuery && filteredTasks.length === 0 && (
              <div className="text-xs text-muted-foreground px-2 py-1">
                No tasks found
              </div>
            )}
          </div>
        )}

        {blockedBy.length > 0 ? (
          <div className="space-y-1">
            {blockedBy.map((dep) => (
              <div
                key={dep.id}
                className="flex items-center gap-2 rounded bg-muted/50 px-2 py-1"
              >
                <span className={cn('shrink-0 rounded px-1 py-0.5 text-[10px]', STATUS_COLORS[dep.status])}>
                  {dep.status.replace('_', ' ')}
                </span>
                <span className="flex-1 truncate text-xs">{dep.title}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(dep)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={10} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          !isAddingBlockedBy && (
            <div className="text-xs text-muted-foreground italic">
              No blocking tasks
            </div>
          )
        )}
      </div>

      {/* Blocking Section */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <HugeiconsIcon icon={ArrowDown01Icon} size={12} />
            <span>Blocking</span>
            {blocking.length > 0 && (
              <span className="text-amber-600">({blocking.length})</span>
            )}
          </div>
          {!isAddingBlocking && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                setIsAddingBlockedBy(false)
                setIsAddingBlocking(true)
              }}
            >
              <HugeiconsIcon icon={Add01Icon} size={12} />
            </Button>
          )}
        </div>

        {isAddingBlocking && (
          <div className="mb-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Input
                ref={inputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className="h-7 text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') handleCancel()
                }}
              />
              <Button variant="ghost" size="icon-xs" onClick={handleCancel}>
                <HugeiconsIcon icon={Cancel01Icon} size={12} />
              </Button>
            </div>
            {filteredTasks.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded border bg-background">
                {filteredTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="w-full px-2 py-1.5 text-left text-xs hover:bg-muted flex items-center gap-2"
                    onClick={() => handleAddBlocking(task.id)}
                  >
                    <span className={cn('shrink-0 rounded px-1 py-0.5 text-[10px]', STATUS_COLORS[task.status])}>
                      {task.status.replace('_', ' ')}
                    </span>
                    <span className="truncate">{task.title}</span>
                  </button>
                ))}
              </div>
            )}
            {searchQuery && filteredTasks.length === 0 && (
              <div className="text-xs text-muted-foreground px-2 py-1">
                No tasks found
              </div>
            )}
          </div>
        )}

        {blocking.length > 0 ? (
          <div className="space-y-1">
            {blocking.map((dep) => (
              <div
                key={dep.id}
                className="flex items-center gap-2 rounded bg-muted/50 px-2 py-1"
              >
                <span className={cn('shrink-0 rounded px-1 py-0.5 text-[10px]', STATUS_COLORS[dep.status])}>
                  {dep.status.replace('_', ' ')}
                </span>
                <span className="flex-1 truncate text-xs">{dep.title}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(dep)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={10} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          !isAddingBlocking && (
            <div className="text-xs text-muted-foreground italic">
              Not blocking any tasks
            </div>
          )
        )}
      </div>
    </div>
  )
}
