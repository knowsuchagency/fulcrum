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

interface DependencyColumnProps {
  title: string
  icon: typeof ArrowUp01Icon
  count: number
  items: TaskDependencyInfo[]
  isAdding: boolean
  onStartAdding: () => void
  onCancelAdding: () => void
  onAdd: (taskId: string) => void
  onRemove: (dep: TaskDependencyInfo) => void
  filteredTasks: { id: string; title: string; status: TaskStatus }[]
  searchQuery: string
  onSearchChange: (query: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  addButtonLabel: string
  emptyLabel: string
}

function DependencyColumn({
  title,
  icon,
  count,
  items,
  isAdding,
  onStartAdding,
  onCancelAdding,
  onAdd,
  onRemove,
  filteredTasks,
  searchQuery,
  onSearchChange,
  inputRef,
  addButtonLabel,
  emptyLabel,
}: DependencyColumnProps) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
        <HugeiconsIcon icon={icon} size={12} />
        <span>{title}</span>
        {count > 0 && (
          <span className="text-warning">({count})</span>
        )}
      </div>

      <div className="rounded-md border bg-muted/30 min-h-[60px]">
        {/* Existing items */}
        <div className="p-1.5 space-y-1">
          {items.length > 0 ? (
            items.map((dep) => (
              <div
                key={dep.id}
                className="flex items-center gap-2 rounded bg-background px-2 py-1.5 group"
              >
                <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', STATUS_COLORS[dep.status])}>
                  {dep.status.replace('_', ' ')}
                </span>
                <span className="flex-1 truncate text-xs">{dep.title}</span>
                <button
                  type="button"
                  onClick={() => onRemove(dep)}
                  className="shrink-0 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={12} />
                </button>
              </div>
            ))
          ) : (
            !isAdding && (
              <div className="text-xs text-muted-foreground italic px-2 py-1.5">
                {emptyLabel}
              </div>
            )
          )}

          {/* Search input when adding */}
          {isAdding && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Input
                  ref={inputRef}
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search tasks..."
                  className="h-7 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') onCancelAdding()
                  }}
                />
                <Button variant="ghost" size="icon-xs" onClick={onCancelAdding}>
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
                      onClick={() => onAdd(task.id)}
                    >
                      <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', STATUS_COLORS[task.status])}>
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
        </div>
      </div>

      {/* Add button */}
      {!isAdding && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1.5 h-7 text-xs text-muted-foreground hover:text-foreground w-full justify-start"
          onClick={onStartAdding}
        >
          <HugeiconsIcon icon={Add01Icon} size={12} className="mr-1.5" />
          {addButtonLabel}
        </Button>
      )}
    </div>
  )
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
  const blockedByInputRef = useRef<HTMLInputElement>(null)
  const blockingInputRef = useRef<HTMLInputElement>(null)

  // Focus input when opening add mode
  useEffect(() => {
    if (isAddingBlockedBy && blockedByInputRef.current) {
      blockedByInputRef.current.focus()
    }
  }, [isAddingBlockedBy])

  useEffect(() => {
    if (isAddingBlocking && blockingInputRef.current) {
      blockingInputRef.current.focus()
    }
  }, [isAddingBlocking])

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

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">Loading dependencies...</div>
    )
  }

  const blockedBy = dependencies?.blockedBy ?? []
  const blocking = dependencies?.blocking ?? []

  return (
    <div className={cn(
      'grid gap-4',
      compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
    )}>
      <DependencyColumn
        title="Blocked by"
        icon={ArrowUp01Icon}
        count={blockedBy.length}
        items={blockedBy}
        isAdding={isAddingBlockedBy}
        onStartAdding={() => {
          setIsAddingBlocking(false)
          setSearchQuery('')
          setIsAddingBlockedBy(true)
        }}
        onCancelAdding={() => {
          setSearchQuery('')
          setIsAddingBlockedBy(false)
        }}
        onAdd={handleAddBlockedBy}
        onRemove={handleRemove}
        filteredTasks={filteredTasks}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        inputRef={blockedByInputRef}
        addButtonLabel="Add blocker"
        emptyLabel="No blockers"
      />

      <DependencyColumn
        title="Blocking"
        icon={ArrowDown01Icon}
        count={blocking.length}
        items={blocking}
        isAdding={isAddingBlocking}
        onStartAdding={() => {
          setIsAddingBlockedBy(false)
          setSearchQuery('')
          setIsAddingBlocking(true)
        }}
        onCancelAdding={() => {
          setSearchQuery('')
          setIsAddingBlocking(false)
        }}
        onAdd={handleAddBlocking}
        onRemove={handleRemove}
        filteredTasks={filteredTasks}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        inputRef={blockingInputRef}
        addButtonLabel="Add blocked task"
        emptyLabel="Not blocking any"
      />
    </div>
  )
}
