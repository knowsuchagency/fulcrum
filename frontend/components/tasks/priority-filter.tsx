import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, ArrowDown01Icon, ArrowUp01Icon, FilterIcon } from '@hugeicons/core-free-icons'
import { useTasks } from '@/hooks/use-tasks'
import { cn } from '@/lib/utils'
import type { TaskPriority } from '../../../shared/types'

const PRIORITIES: TaskPriority[] = ['high', 'medium', 'low']

interface PriorityFilterProps {
  value: TaskPriority[]
  onChange: (priorities: TaskPriority[]) => void
}

const PRIORITY_STYLES: Record<TaskPriority, { icon: typeof ArrowUp01Icon; className: string }> = {
  high: { icon: ArrowUp01Icon, className: 'text-destructive' },
  medium: { icon: FilterIcon, className: 'text-primary' },
  low: { icon: ArrowDown01Icon, className: 'text-muted-foreground' },
}

export function PriorityFilter({ value, onChange }: PriorityFilterProps) {
  const { t } = useTranslation('tasks')
  const [open, setOpen] = useState(false)

  const { data: tasks = [] } = useTasks()

  // Count tasks per priority (null defaults to medium)
  const priorityCounts: Record<TaskPriority, number> = { high: 0, medium: 0, low: 0 }
  for (const task of tasks) {
    priorityCounts[task.priority ?? 'medium']++
  }

  const togglePriority = (priority: TaskPriority) => {
    if (value.includes(priority)) {
      onChange(value.filter((p) => p !== priority))
    } else {
      onChange([...value, priority])
    }
  }

  const removePriority = (priority: TaskPriority, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(value.filter((p) => p !== priority))
  }

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange([])
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'shrink-0 gap-1.5 h-7 px-2',
              value.length > 0 && 'pr-1'
            )}
          />
        }
      >
        <HugeiconsIcon icon={FilterIcon} size={12} strokeWidth={2} className="text-muted-foreground" />
        {value.length === 0 ? (
          <>
            <span className="text-xs">{t('priorityFilter.label')}</span>
            <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} className="text-muted-foreground" />
          </>
        ) : (
          <>
            <div className="flex items-center gap-1">
              {value.map((priority) => (
                <Badge
                  key={priority}
                  variant="secondary"
                  className="h-5 px-1.5 text-[10px] gap-0.5"
                >
                  <HugeiconsIcon
                    icon={PRIORITY_STYLES[priority].icon}
                    size={10}
                    strokeWidth={2}
                    className={PRIORITY_STYLES[priority].className}
                  />
                  {t(`priorityFilter.priorities.${priority}`)}
                  <button
                    onClick={(e) => removePriority(priority, e)}
                    className="hover:text-destructive transition-colors"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={10} />
                  </button>
                </Badge>
              ))}
            </div>
            <button
              onClick={clearAll}
              className="ml-0.5 p-0.5 hover:text-destructive transition-colors"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </button>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-0">
        <div className="py-1">
          {PRIORITIES.map((priority) => {
            const isSelected = value.includes(priority)
            const style = PRIORITY_STYLES[priority]
            return (
              <button
                key={priority}
                className={cn(
                  'w-full px-3 py-1.5 text-left text-xs hover:bg-accent flex items-center gap-2',
                  isSelected && 'bg-accent/50'
                )}
                onClick={() => togglePriority(priority)}
              >
                <Checkbox
                  checked={isSelected}
                  className="pointer-events-none"
                />
                <HugeiconsIcon
                  icon={style.icon}
                  size={14}
                  strokeWidth={2}
                  className={style.className}
                />
                <span className="flex-1">{t(`priorityFilter.priorities.${priority}`)}</span>
                <span className="text-muted-foreground text-[10px]">
                  {priorityCounts[priority]}
                </span>
              </button>
            )
          })}
        </div>
        {value.length > 0 && (
          <div className="p-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => {
                onChange([])
                setOpen(false)
              }}
            >
              {t('priorityFilter.clear')}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
