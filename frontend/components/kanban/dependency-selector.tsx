import { useState, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons'
import { useTasks } from '@/hooks/use-tasks'
import type { TaskStatus } from '@/types'
import { cn } from '@/lib/utils'

const STATUS_COLORS: Record<TaskStatus, string> = {
  TO_DO: 'bg-status-todo/20 text-status-todo',
  IN_PROGRESS: 'bg-status-in-progress/20 text-status-in-progress',
  IN_REVIEW: 'bg-status-in-review/20 text-status-in-review',
  DONE: 'bg-status-done/20 text-status-done',
  CANCELED: 'bg-status-canceled/20 text-status-canceled',
}

interface DependencySelectorProps {
  /** Selected task IDs that will block the new task */
  selectedIds: string[]
  /** Callback when selection changes */
  onSelectionChange: (ids: string[]) => void
  /** Class name for the container */
  className?: string
}

/**
 * DependencySelector - A controlled component for selecting task dependencies during task creation.
 *
 * This is a simplified version of DependencyManager designed for use before a task exists.
 * It shows a filter-as-you-type search to select tasks that will block the new task.
 */
export function DependencySelector({
  selectedIds,
  onSelectionChange,
  className,
}: DependencySelectorProps) {
  const { t } = useTranslation('tasks')
  const { data: allTasks = [] } = useTasks()
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when opening search mode
  useEffect(() => {
    if (isSearching && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isSearching])

  // Get selected task objects
  const selectedTasks = useMemo(() => {
    return allTasks.filter((task) => selectedIds.includes(task.id))
  }, [allTasks, selectedIds])

  // Filter available tasks for adding - prioritize incomplete tasks
  const filteredTasks = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    const completedStatuses = new Set(['DONE', 'CANCELED'])

    return allTasks
      .filter((task) => !selectedIds.includes(task.id))
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
  }, [allTasks, selectedIds, searchQuery])

  const handleAdd = (taskId: string) => {
    onSelectionChange([...selectedIds, taskId])
    setSearchQuery('')
    setIsSearching(false)
  }

  const handleRemove = (taskId: string) => {
    onSelectionChange(selectedIds.filter((id) => id !== taskId))
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Selected tasks as chips */}
      {selectedTasks.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTasks.map((task) => (
            <div
              key={task.id}
              className="inline-flex items-center gap-1.5 rounded border border-border bg-card px-2 py-1 text-xs"
            >
              <span className={cn('shrink-0 rounded px-1 py-0.5 text-[10px] font-medium', STATUS_COLORS[task.status])}>
                {task.status.replace('_', ' ')}
              </span>
              <span className="truncate max-w-[150px]">{task.title}</span>
              <button
                type="button"
                onClick={() => handleRemove(task.id)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon icon={ArrowUp01Icon} size={14} className="text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setIsSearching(true)
            }}
            onFocus={() => setIsSearching(true)}
            onBlur={() => {
              // Delay to allow click on dropdown items
              setTimeout(() => setIsSearching(false), 150)
            }}
            placeholder={t('createModal.blockedByPlaceholder', 'Search tasks to block this...')}
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchQuery('')
                setIsSearching(false)
                inputRef.current?.blur()
              }
            }}
          />
        </div>

        {/* Dropdown results */}
        {isSearching && (searchQuery || filteredTasks.length > 0) && (
          <div className="absolute z-10 top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-md border bg-popover shadow-md">
            {filteredTasks.length > 0 ? (
              filteredTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="w-full px-2 py-1.5 text-left text-xs hover:bg-muted flex items-center gap-2"
                  onMouseDown={(e) => {
                    e.preventDefault() // Prevent blur before click
                    handleAdd(task.id)
                  }}
                >
                  <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', STATUS_COLORS[task.status])}>
                    {task.status.replace('_', ' ')}
                  </span>
                  <span className="truncate">{task.title}</span>
                </button>
              ))
            ) : (
              searchQuery && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {t('createModal.noTasksFound', 'No tasks found')}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}
