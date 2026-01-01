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
import { PackageIcon, GitPullRequestIcon, Task01Icon, Settings05Icon } from '@hugeicons/core-free-icons'
import { TaskConfigModal } from '@/components/task-config-modal'

interface TaskCardProps {
  task: Task
  isDragPreview?: boolean
}

export function TaskCard({ task, isDragPreview }: TaskCardProps) {
  const { setActiveTask } = useDrag()
  const { isSelected, toggleSelection } = useSelection()
  const navigate = useNavigate()
  const selected = isSelected(task.id)

  const ref = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null)
  const [previewContainer, setPreviewContainer] = useState<HTMLElement | null>(null)
  const [configModalOpen, setConfigModalOpen] = useState(false)

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

    // Normal click: navigate
    navigate({ to: '/tasks/$taskId', params: { taskId: task.id } })
    hasDragged.current = false
  }


  const cardContent = (
    <div className="group/card relative">
      {/* Selection checkbox - OUTSIDE the draggable Card */}
      {!isDragPreview && (
        <div
          className={cn(
            'absolute left-2 top-2 z-20 transition-opacity',
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
          'transition-shadow hover:shadow-md relative cursor-grab active:cursor-grabbing',
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
        {!isDragPreview && (
          <button
            type="button"
            className="shrink-0 p-0.5 -m-0.5 rounded hover:bg-muted transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              setConfigModalOpen(true)
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <HugeiconsIcon icon={Settings05Icon} size={14} strokeWidth={2} className="text-muted-foreground" />
          </button>
        )}
      </CardHeader>
      <CardContent className="p-3 pt-1">
        {task.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {task.description}
          </p>
        )}
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground/70">
          <HugeiconsIcon icon={PackageIcon} size={12} strokeWidth={2} />
          <span>{task.repoName}</span>
          {task.prUrl && (
            <>
              <span className="text-muted-foreground/30">•</span>
              <HugeiconsIcon icon={GitPullRequestIcon} size={12} strokeWidth={2} className="text-foreground" />
            </>
          )}
          {task.linearTicketId && (
            <>
              <span className="text-muted-foreground/30">•</span>
              <HugeiconsIcon icon={Task01Icon} size={12} strokeWidth={2} className="text-foreground" />
            </>
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
      <TaskConfigModal
        task={task}
        open={configModalOpen}
        onOpenChange={setConfigModalOpen}
      />
    </>
  )
}
