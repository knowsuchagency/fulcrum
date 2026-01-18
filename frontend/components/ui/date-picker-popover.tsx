import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { HugeiconsIcon } from '@hugeicons/react'
import { Calendar03Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

interface DatePickerPopoverProps {
  value: string | null // YYYY-MM-DD format or null
  onChange: (date: string | null) => void
  placeholder?: string
  className?: string
  showClear?: boolean
  isOverdue?: boolean
}

export function DatePickerPopover({
  value,
  onChange,
  placeholder = 'Set due date',
  className,
  showClear = true,
  isOverdue = false,
}: DatePickerPopoverProps) {
  const [open, setOpen] = useState(false)

  // Parse the string date to Date object for the Calendar
  const selectedDate = value ? new Date(value + 'T00:00:00') : undefined

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      // Format as YYYY-MM-DD
      const formatted = date.toISOString().split('T')[0]
      onChange(formatted)
    }
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
    setOpen(false)
  }

  const formatDisplayDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1 hover:bg-muted transition-colors',
          isOverdue && 'text-destructive',
          className
        )}
      >
        <HugeiconsIcon icon={Calendar03Icon} size={14} />
        {value ? (
          <span className={isOverdue ? 'font-medium' : ''}>
            {formatDisplayDate(value)}
            {isOverdue && ' (Overdue)'}
          </span>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          defaultMonth={selectedDate}
        />
        {showClear && value && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={handleClear}
            >
              Clear date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
