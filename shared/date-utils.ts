/**
 * Get today's date string (YYYY-MM-DD) in the specified timezone.
 * @param timezone - IANA timezone string or null for system timezone
 */
export function getTodayInTimezone(timezone: string | null): string {
  const now = new Date()

  if (!timezone) {
    // Use local system timezone
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Use specified timezone - en-CA locale gives YYYY-MM-DD format
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(now)
}

/**
 * Check if a due date is overdue based on configured timezone.
 * @param dueDate - The due date in YYYY-MM-DD format
 * @param timezone - IANA timezone string or null for system timezone
 * @param status - The task status
 */
export function isDateOverdue(
  dueDate: string | null,
  timezone: string | null,
  status: string
): boolean {
  if (!dueDate) return false
  if (status === 'DONE' || status === 'CANCELED') return false

  const today = getTodayInTimezone(timezone)
  return dueDate < today
}

/**
 * Check if a due date is today based on configured timezone.
 * @param dueDate - The due date in YYYY-MM-DD format
 * @param timezone - IANA timezone string or null for system timezone
 * @param status - The task status
 */
export function isDueToday(
  dueDate: string | null,
  timezone: string | null,
  status: string
): boolean {
  if (!dueDate) return false
  if (status === 'DONE' || status === 'CANCELED') return false

  const today = getTodayInTimezone(timezone)
  return dueDate === today
}
