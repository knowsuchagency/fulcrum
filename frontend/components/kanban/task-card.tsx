import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from '@tanstack/react-router'
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview'
import { pointerOutsideOfPreview } from '@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview'
import { attachClosestEdge, extractClosestEdge, type Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { useDrag } from './drag-context'
import { useSelection } from './selection-context'
import type { Task } from '@/types'
import { cn } from '@/lib/utils'
import { HugeiconsIcon } from '@hugeicons/react'
import { FolderLibraryIcon, GitPullRequestIcon, Calendar03Icon, AlertDiamondIcon, Alert02Icon } from '@hugeicons/core-free-icons'
import { useRepositories } from '@/hooks/use-repositories'
import { useIsOverdue, useIsDueToday } from '@/hooks/use-date-utils'

interface TaskCardProps {
  task: Task
  isDragPreview?: boolean
  isBlocked?: boolean
  isBlocking?: boolean
}

export function TaskCard({ task, isDragPreview, isBlocked, isBlocking }: TaskCardProps) {
  const { setActiveTask } = useDrag()
  const { isSelected, toggleSelection } = useSelection()
  const navigate = useNavigate()
  const { data: repositories } = useRepositories()
  const selected = isSelected(task.id)

  const ref = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null)
  const [previewContainer, setPreviewContainer] = useState<HTMLElement | null>(null)

  // Determine if this is a code task (has worktree or is configured with a repository)
  const isCodeTask = !!(task.worktreePath || task.repositoryId)
  const isActiveWorktreeTask = !!task.worktreePath
  const isPendingCodeTask = !task.worktreePath && !!task.repositoryId

  // Get repository info for pending code tasks
  const pendingRepo = isPendingCodeTask
    ? repositories?.find((r) => r.id === task.repositoryId)
    : null

  // Check if task is overdue or due today using configured timezone
  const isOverdue = useIsOverdue(task.dueDate, task.status)
  const isDueToday = useIsDueToday(task.dueDate, task.status)

  // Track if drag occurred to distinguish from click
  const hasDragged = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || isDragPreview) return

    return combine(
      draggable({
        element: el,
        getInitialData: () => ({
          type: 'task',
          taskId: task.id,
          status: task.status,
        }),
        onGenerateDragPreview: ({ nativeSetDragImage }) => {
          setCustomNativeDragPreview({
            nativeSetDragImage,
            getOffset: pointerOutsideOfPreview({
              x: '16px',
              y: '8px',
            }),
            render: ({ container }) => {
              setPreviewContainer(container)
            },
          })
        },
        onDragStart: () => {
          setIsDragging(true)
          setActiveTask(task)
          hasDragged.current = true
        },
        onDrop: () => {
          setIsDragging(false)
          setActiveTask(null)
          setPreviewContainer(null)
        },
      }),
      dropTargetForElements({
        element: el,
        getData: ({ input, element }) => {
          const data = {
            type: 'task',
            taskId: task.id,
            status: task.status,
          }
          return attachClosestEdge(data, {
            input,
            element,
            allowedEdges: ['top', 'bottom'],
          })
        },
        canDrop: ({ source }) => {
          return source.data.taskId !== task.id
        },
        onDragEnter: ({ self }) => {
          setClosestEdge(extractClosestEdge(self.data))
        },
        onDrag: ({ self }) => {
          setClosestEdge(extractClosestEdge(self.data))
        },
        onDragLeave: () => {
          setClosestEdge(null)
        },
        onDrop: () => {
          setClosestEdge(null)
        },
      })
    )
  }, [task, isDragPreview, setActiveTask])

  const handlePointerDown = () => {
    hasDragged.current = false
  }

  const handleClick = () => {
    // Only navigate if we didn't drag
    if (hasDragged.current) {
      hasDragged.current = false
      return
    }

    // For active code tasks (has worktree), navigate to detail page
    // For non-code tasks and pending code tasks, open the modal via URL param
    if (isActiveWorktreeTask) {
      navigate({ to: '/tasks/$taskId', params: { taskId: task.id } })
    } else {
      navigate({
        to: '/tasks',
        search: (prev) => ({ ...prev, task: task.id }),
        replace: true,
      })
    }
    hasDragged.current = false
  }


  const cardContent = (
    <div className="group/card relative">
      {/* Selection checkbox - OUTSIDE the draggable Card */}
      {!isDragPreview && (
        <div
          className={cn(
            'absolute left-2 top-2 z-20 transition-opacity duration-150',
            selected ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100'
          )}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => toggleSelection(task.id)}
          />
        </div>
      )}

      <Card
        ref={isDragPreview ? undefined : ref}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        className={cn(
          'relative cursor-grab active:cursor-grabbing',
          'transition-all duration-200 ease-out',
          'hover:shadow-md hover:scale-[1.02] hover:-translate-y-0.5',
          isDragging && 'opacity-50',
          selected && 'ring-2 ring-primary bg-primary/5'
        )}
      >
        {/* Drop indicator line */}
        {closestEdge && (
          <div
            className={cn(
              'absolute left-0 right-0 h-0.5 bg-primary z-10',
              closestEdge === 'top' && '-top-1',
              closestEdge === 'bottom' && '-bottom-1'
            )}
          />
        )}

        <CardHeader className={cn(
          'p-3 pb-1 flex flex-row items-start justify-between gap-2',
          !isDragPreview && 'pl-8' // Make room for checkbox
        )}>
        <CardTitle className="text-sm font-medium leading-tight flex-1">
          {task.title}
        </CardTitle>
      </CardHeader>
      <CardContent className={cn('p-3 pt-1', !isDragPreview && 'pl-8')}>
        {task.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {task.description}
          </p>
        )}
        {/* Tags row */}
        {task.tags.length > 0 && (
          <div className="mt-2 flex items-center gap-1 flex-wrap">
            {task.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium"
              >
                {tag}
              </span>
            ))}
            {task.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{task.tags.length - 3}</span>
            )}
          </div>
        )}
        {/* Metadata row */}
        <div className={cn(
          'flex items-center gap-1 text-xs text-muted-foreground/70 flex-wrap',
          task.tags.length > 0 ? 'mt-1.5' : 'mt-2'
        )}>
          {/* Blocked indicator (red) */}
          {isBlocked && (
            <>
              <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-destructive font-medium">
                <HugeiconsIcon icon={AlertDiamondIcon} size={12} strokeWidth={2} />
                <span>Blocked</span>
              </span>
              <span className="text-muted-foreground/30">•</span>
            </>
          )}
          {/* Blocking indicator (accent/blue) */}
          {isBlocking && (
            <>
              <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-accent font-medium">
                <HugeiconsIcon icon={Alert02Icon} size={12} strokeWidth={2} />
                <span>Blocking</span>
              </span>
              <span className="text-muted-foreground/30">•</span>
            </>
          )}
          {/* Code task metadata - active (has worktree) */}
          {isActiveWorktreeTask && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <HugeiconsIcon icon={FolderLibraryIcon} size={12} strokeWidth={2} />
              <span className="truncate max-w-24">{task.repoName}</span>
              {task.prUrl && (
                <>
                  <span className="text-muted-foreground/30">•</span>
                  <HugeiconsIcon icon={GitPullRequestIcon} size={12} strokeWidth={2} className="text-foreground" />
                </>
              )}
            </span>
          )}
          {/* Code task metadata - pending (has repositoryId but no worktree yet) */}
          {isPendingCodeTask && pendingRepo && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <HugeiconsIcon icon={FolderLibraryIcon} size={12} strokeWidth={2} />
              <span className="truncate max-w-24">{pendingRepo.displayName}</span>
            </span>
          )}
          {/* Due date - shown for all tasks */}
          {task.dueDate && (
            <>
              {isCodeTask && <span className="text-muted-foreground/30">•</span>}
              <span className={cn(
                'inline-flex items-center gap-1 whitespace-nowrap',
                isOverdue ? 'text-destructive' : isDueToday ? 'text-amber-600 dark:text-amber-500' : ''
              )}>
                <HugeiconsIcon icon={Calendar03Icon} size={12} strokeWidth={2} />
                <span>{new Date(task.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </span>
            </>
          )}
          {/* Fallback for non-code tasks with no metadata */}
          {!isCodeTask && !isBlocked && !isBlocking && task.tags.length === 0 && !task.dueDate && (
            <span className="italic">Non-code task</span>
          )}
        </div>
      </CardContent>
      </Card>
    </div>
  )

  return (
    <>
      {cardContent}
      {previewContainer && createPortal(
        <div className="w-72 max-w-[90vw]">
          <TaskCard task={task} isDragPreview />
        </div>,
        previewContainer
      )}
    </>
  )
}
