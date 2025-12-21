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
import { useSelection } from './selection-context'
import { useDrag } from './drag-context'
import type { Task } from '@/types'
import { cn } from '@/lib/utils'
import { HugeiconsIcon } from '@hugeicons/react'
import { Folder01Icon, GitPullRequestIcon } from '@hugeicons/core-free-icons'

interface TaskCardProps {
  task: Task
  isDragPreview?: boolean
}

export function TaskCard({ task, isDragPreview }: TaskCardProps) {
  const { selectMode, isSelected, toggle } = useSelection()
  const { setActiveTask } = useDrag()
  const selected = isSelected(task.id)
  const navigate = useNavigate()

  const ref = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null)
  const [previewContainer, setPreviewContainer] = useState<HTMLElement | null>(null)

  // Track if drag occurred to distinguish from click
  const hasDragged = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || selectMode || isDragPreview) return

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
  }, [task, selectMode, isDragPreview, setActiveTask])

  const handlePointerDown = () => {
    hasDragged.current = false
  }

  const handleClick = (e: React.MouseEvent) => {
    if (selectMode) {
      e.preventDefault()
      toggle(task.id)
      return
    }

    // Only navigate if we didn't drag
    if (!hasDragged.current) {
      navigate({ to: '/tasks/$taskId', params: { taskId: task.id } })
    }
    hasDragged.current = false
  }

  const cardContent = (
    <Card
      ref={isDragPreview ? undefined : ref}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className={cn(
        'transition-shadow hover:shadow-md relative',
        selectMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-50',
        selected && 'ring-2 ring-primary'
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

      {/* Checkbox in top-right - only in select mode */}
      {selectMode && (
        <div
          className="absolute right-2 top-2 z-10 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            toggle(task.id)
          }}
        >
          <Checkbox checked={selected} className="cursor-pointer pointer-events-none" />
        </div>
      )}

      <CardHeader className={cn('p-3 pb-1', selectMode && 'pr-8')}>
        <CardTitle className="text-sm font-medium leading-tight">
          {task.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-1">
        {task.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {task.description}
          </p>
        )}
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground/70">
          <HugeiconsIcon icon={Folder01Icon} size={12} strokeWidth={2} />
          <span>{task.repoName}</span>
          {task.prUrl && (
            <>
              <span className="text-muted-foreground/30">•</span>
              <HugeiconsIcon icon={GitPullRequestIcon} size={12} strokeWidth={2} className="text-foreground" />
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )

  return (
    <>
      {cardContent}
      {previewContainer && createPortal(
        <div className="w-72">
          <TaskCard task={task} isDragPreview />
        </div>,
        previewContainer
      )}
    </>
  )
}
