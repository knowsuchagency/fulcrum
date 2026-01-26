import { useMemo } from 'react'
import { useTimezone } from './use-config'
import { getTodayInTimezone, isDateOverdue, isDueToday } from '@shared/date-utils'

/**
 * Hook that returns today's date string (YYYY-MM-DD) in the configured timezone.
 */
export function useToday(): string {
  const { data: timezone } = useTimezone()
  return useMemo(() => getTodayInTimezone(timezone), [timezone])
}

/**
 * Hook that checks if a due date is overdue based on configured timezone.
 */
export function useIsOverdue(dueDate: string | null, status: string): boolean {
  const { data: timezone } = useTimezone()
  return useMemo(
    () => isDateOverdue(dueDate, timezone, status),
    [dueDate, timezone, status]
  )
}

/**
 * Hook that checks if a due date is today based on configured timezone.
 */
export function useIsDueToday(dueDate: string | null, status: string): boolean {
  const { data: timezone } = useTimezone()
  return useMemo(
    () => isDueToday(dueDate, timezone, status),
    [dueDate, timezone, status]
  )
}
