import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { useSelection } from './selection-context'
import type { Task } from '@/types'
import { cn } from '@/lib/utils'
import { HugeiconsIcon } from '@hugeicons/react'
import { Folder01Icon } from '@hugeicons/core-free-icons'

interface TaskCardProps {
  task: Task
  isDragging?: boolean
}

export function TaskCard({ task, isDragging }: TaskCardProps) {
  const { selectMode, isSelected, toggle } = useSelection()
  const selected = isSelected(task.id)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id, disabled: selectMode })

  const style = {
    transform: CSS.Transform.toString(transform),
  }

  const handleCardClick = (e: React.MouseEvent) => {
    if (selectMode) {
      e.preventDefault()
      toggle(task.id)
    }
  }

  const cardContent = (
    <Card
      ref={setNodeRef}
      style={style}
      {...(selectMode ? {} : { ...attributes, ...listeners })}
      onClick={handleCardClick}
      className={cn(
        'transition-shadow hover:shadow-md relative',
        selectMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
        (isDragging || isSortableDragging) && 'opacity-50 shadow-lg',
        selected && 'ring-2 ring-primary'
      )}
    >
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
          {task.repoName}
        </div>
      </CardContent>
    </Card>
  )

  // In select mode, don't wrap with Link
  if (selectMode) {
    return cardContent
  }

  return (
    <Link to="/tasks/$taskId" params={{ taskId: task.id }}>
      {cardContent}
    </Link>
  )
}
