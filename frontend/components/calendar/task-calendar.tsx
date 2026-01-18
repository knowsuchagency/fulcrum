import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTasks } from '@/hooks/use-tasks'
import type { Task, TaskStatus } from '@/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { NonCodeTaskModal } from '@/components/task/non-code-task-modal'

const STATUS_COLORS: Record<TaskStatus, { bg: string; border: string; text: string }> = {
  TO_DO: { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-700' },
  IN_PROGRESS: { bg: 'bg-gray-200', border: 'border-gray-500', text: 'text-gray-700' },
  IN_REVIEW: { bg: 'bg-amber-100', border: 'border-amber-500', text: 'text-amber-800' },
  DONE: { bg: 'bg-emerald-100', border: 'border-emerald-600', text: 'text-emerald-800' },
  CANCELED: { bg: 'bg-red-100', border: 'border-red-500', text: 'text-red-800' },
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface TaskCalendarProps {
  className?: string
}

export function TaskCalendar({ className }: TaskCalendarProps) {
  const navigate = useNavigate()
  const { data: tasks = [] } = useTasks()
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // Get tasks with due dates grouped by date
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const task of tasks) {
      if (task.dueDate) {
        const dateKey = task.dueDate.split('T')[0] // YYYY-MM-DD
        if (!map.has(dateKey)) {
          map.set(dateKey, [])
        }
        map.get(dateKey)!.push(task)
      }
    }
    return map
  }, [tasks])

  // Calculate calendar grid
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()

    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    const startDate = new Date(firstDay)
    startDate.setDate(startDate.getDate() - firstDay.getDay())

    const endDate = new Date(lastDay)
    endDate.setDate(endDate.getDate() + (6 - lastDay.getDay()))

    const days: Date[] = []
    const current = new Date(startDate)
    while (current <= endDate) {
      days.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }

    return days
  }, [currentDate])

  const goToPrevMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const goToNextMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const handleTaskClick = (task: Task) => {
    // For code tasks, navigate to detail page
    // For non-code tasks, open the modal
    if (task.worktreePath) {
      navigate({
        to: '/tasks/$taskId',
        params: { taskId: task.id },
      })
    } else {
      setSelectedTask(task)
      setModalOpen(true)
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const monthYear = currentDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const tasksWithDueDates = tasks.filter((t) => t.dueDate).length

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToPrevMonth}>
            <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
          </Button>
          <Button variant="outline" size="sm" onClick={goToNextMonth}>
            <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToToday}>
            Today
          </Button>
        </div>
        <h2 className="text-lg font-semibold">{monthYear}</h2>
        <div className="text-sm text-muted-foreground">
          {tasksWithDueDates} tasks with due dates
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-7 gap-px rounded-lg border bg-border">
          {/* Weekday headers */}
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="bg-muted px-2 py-1 text-center text-xs font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}

          {/* Calendar days */}
          {calendarDays.map((date, index) => {
            const dateKey = date.toISOString().split('T')[0]
            const dayTasks = tasksByDate.get(dateKey) || []
            const isCurrentMonth = date.getMonth() === currentDate.getMonth()
            const isToday = date.getTime() === today.getTime()

            return (
              <div
                key={index}
                className={cn(
                  'min-h-[100px] bg-background p-1',
                  !isCurrentMonth && 'bg-muted/50'
                )}
              >
                <div
                  className={cn(
                    'mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs',
                    isToday && 'bg-primary text-primary-foreground font-semibold',
                    !isToday && !isCurrentMonth && 'text-muted-foreground'
                  )}
                >
                  {date.getDate()}
                </div>
                <div className="flex flex-col gap-0.5">
                  {dayTasks.slice(0, 3).map((task) => {
                    const colors = STATUS_COLORS[task.status]
                    const isOverdue =
                      date < today && task.status !== 'DONE' && task.status !== 'CANCELED'

                    return (
                      <button
                        key={task.id}
                        onClick={() => handleTaskClick(task)}
                        className={cn(
                          'w-full truncate rounded px-1 py-0.5 text-left text-[10px] border transition-opacity hover:opacity-80',
                          colors.bg,
                          colors.text,
                          isOverdue ? 'border-red-500' : colors.border
                        )}
                        title={task.title}
                      >
                        {task.title}
                      </button>
                    )
                  })}
                  {dayTasks.length > 3 && (
                    <div className="px-1 text-[10px] text-muted-foreground">
                      +{dayTasks.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Non-code task modal */}
      {selectedTask && !selectedTask.worktreePath && (
        <NonCodeTaskModal
          task={selectedTask}
          open={modalOpen}
          onOpenChange={(open) => {
            setModalOpen(open)
            if (!open) setSelectedTask(null)
          }}
        />
      )}
    </div>
  )
}
