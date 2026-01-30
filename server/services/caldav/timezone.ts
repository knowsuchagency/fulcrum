/**
 * Timezone conversion utilities for CalDAV events.
 *
 * All dates are stored in the DB as UTC (ISO 8601 with Z suffix for timed events,
 * YYYY-MM-DD for all-day events). Conversion to/from the user's configured
 * timezone happens at the API boundary.
 */

import { getSettings } from '../../lib/settings'

/**
 * Get the user's configured timezone (IANA), falling back to system default.
 */
export function getUserTimezone(): string {
  const settings = getSettings()
  return settings.appearance.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Convert a local date-time in a given IANA timezone to a UTC ISO string.
 *
 * Input: "2026-02-04T15:00:00" + "America/Los_Angeles"
 * Output: "2026-02-04T23:00:00Z"
 *
 * Uses an iterative approach with Intl.DateTimeFormat to resolve the offset.
 */
export function localToUTC(isoNoTZ: string, tz: string): string {
  const [datePart, timePart] = isoNoTZ.split('T')
  const [y, mo, d] = datePart.split('-').map(Number)
  const [h, mi, s] = (timePart?.replace('Z', '') || '00:00:00').split(':').map(v => parseInt(v) || 0)

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  })

  // Initial guess: treat the wall-clock time as UTC
  let epochMs = Date.UTC(y, mo - 1, d, h, mi, s)
  const targetMs = epochMs // the wall-clock time we want in the target tz

  // Iterate to converge (usually 1–2 iterations)
  for (let i = 0; i < 3; i++) {
    const parts = fmt.formatToParts(new Date(epochMs))
    const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0')
    const hr = get('hour') === 24 ? 0 : get('hour')
    const localMs = Date.UTC(get('year'), get('month') - 1, get('day'), hr, get('minute'), get('second'))
    epochMs += targetMs - localMs
  }

  return new Date(epochMs).toISOString().replace('.000Z', 'Z')
}

/**
 * Convert a UTC ISO string to a local ISO string in the given timezone.
 *
 * Input: "2026-02-04T23:00:00Z" + "America/Los_Angeles"
 * Output: "2026-02-04T15:00:00"
 */
export function utcToLocal(utcIso: string, tz: string): string {
  const date = new Date(utcIso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: string) => parts.find(p => p.type === type)?.value || ''
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`
}

/**
 * Convert an iCal compact date (with optional TZID) to a UTC ISO string.
 *
 * Handles:
 * - "20260204T150000" + tzid="America/Los_Angeles" → "2026-02-04T23:00:00Z"
 * - "20260204T150000Z" (already UTC) → "2026-02-04T15:00:00Z"
 * - "20260204T150000" (no tzid, floating) → treated as UTC → "2026-02-04T15:00:00Z"
 * - "20260204" (all-day) → "2026-02-04"
 */
export function icalDateToUTC(value: string, params: string): { iso: string; allDay: boolean } {
  const isAllDay = params.includes('VALUE=DATE') && !params.includes('VALUE=DATE-TIME')

  if (isAllDay) {
    // All-day events: store as YYYY-MM-DD, no timezone conversion
    const v = value.includes('-') ? value : `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    return { iso: v.slice(0, 10), allDay: true }
  }

  // Already an ISO string with dashes
  if (value.includes('-')) {
    if (value.endsWith('Z')) return { iso: value, allDay: false }
    // Has dashes but no Z — check for TZID
    const tzid = extractTZID(params)
    if (tzid) return { iso: localToUTC(value, tzid), allDay: false }
    // Floating — treat as UTC
    return { iso: value.endsWith('Z') ? value : value + 'Z', allDay: false }
  }

  // Compact iCal format: YYYYMMDDTHHmmss or YYYYMMDDTHHmmssZ
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/)
  if (!match) return { iso: value, allDay: false }

  const [, y, m, d, H, M, S, z] = match
  const isoLocal = `${y}-${m}-${d}T${H}:${M}:${S}`

  if (z === 'Z') {
    return { iso: isoLocal + 'Z', allDay: false }
  }

  const tzid = extractTZID(params)
  if (tzid) {
    return { iso: localToUTC(isoLocal, tzid), allDay: false }
  }

  // No timezone info — treat as UTC
  return { iso: isoLocal + 'Z', allDay: false }
}

/**
 * Extract TZID value from iCal property parameters.
 * e.g., "TZID=America/Los_Angeles" → "America/Los_Angeles"
 */
function extractTZID(params: string): string | null {
  const match = params.match(/TZID=([^;:]+)/)
  return match ? match[1] : null
}

/**
 * Convert a stored date (UTC ISO or YYYY-MM-DD) to the user's timezone.
 * Used at the API response boundary.
 */
export function toUserTimezone(stored: string, tz: string): string {
  // All-day dates: no conversion
  if (stored.length === 10 && stored.includes('-')) return stored
  // UTC timed event → local
  return utcToLocal(stored, tz)
}

/**
 * Convert a user-provided date string to UTC for DB storage/query.
 * Accepts ISO with or without Z, or date-only YYYY-MM-DD.
 */
export function fromUserTimezone(input: string, tz: string): string {
  // Already UTC
  if (input.endsWith('Z')) return input
  // Date-only: no conversion
  if (input.length === 10 && input.includes('-')) return input
  // Local time → UTC
  return localToUTC(input, tz)
}
