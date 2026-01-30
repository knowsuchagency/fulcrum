/**
 * iCalendar parsing and generation helpers
 *
 * Extracts event properties from raw iCalendar text and generates
 * iCalendar strings for creating/updating events.
 *
 * All parsed dates are normalized to UTC (ISO 8601 with Z suffix for timed
 * events, YYYY-MM-DD for all-day). Timezone conversion to/from the user's
 * local timezone happens at the API boundary (see timezone.ts).
 */

import { icalDateToUTC } from './timezone'

export interface ParsedEvent {
  uid?: string
  summary?: string
  description?: string
  location?: string
  dtstart?: string
  dtend?: string
  duration?: string
  allDay: boolean
  recurrenceRule?: string
  status?: string
  organizer?: string
  attendees?: string[]
}

/**
 * Parse a raw iCalendar string and extract event properties.
 * This is intentionally simple — we preserve rawIcal for lossless round-tripping.
 */
export function parseIcalEvent(ical: string): ParsedEvent {
  const lines = unfoldIcal(ical)
  const result: ParsedEvent = { allDay: false }
  const attendees: string[] = []
  let inVevent = false

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { inVevent = true; continue }
    if (line === 'END:VEVENT') { inVevent = false; continue }
    // Only parse properties within VEVENT — ignore VTIMEZONE, VALARM, etc.
    if (!inVevent) continue

    const [key, ...valueParts] = line.split(':')
    const value = valueParts.join(':')

    // Handle properties with parameters (e.g., DTSTART;VALUE=DATE:20250101)
    const propName = key.split(';')[0].toUpperCase()
    const params = key.includes(';') ? key.substring(key.indexOf(';') + 1) : ''

    switch (propName) {
      case 'UID':
        result.uid = value
        break
      case 'SUMMARY':
        result.summary = unescapeIcal(value)
        break
      case 'DESCRIPTION':
        result.description = unescapeIcal(value)
        break
      case 'LOCATION':
        result.location = unescapeIcal(value)
        break
      case 'DTSTART': {
        const parsed = icalDateToUTC(value, params)
        result.allDay = parsed.allDay
        result.dtstart = parsed.iso
        break
      }
      case 'DTEND': {
        const parsed = icalDateToUTC(value, params)
        result.dtend = parsed.iso
        break
      }
      case 'DURATION':
        result.duration = value
        break
      case 'RRULE':
        result.recurrenceRule = value
        break
      case 'STATUS':
        result.status = value
        break
      case 'ORGANIZER':
        result.organizer = value.replace(/^mailto:/i, '')
        break
      case 'ATTENDEE':
        attendees.push(value.replace(/^mailto:/i, ''))
        break
    }
  }

  if (attendees.length > 0) {
    result.attendees = attendees
  }

  return result
}

/**
 * Generate a minimal iCalendar VEVENT string for creating new events.
 */
export function generateIcalEvent(event: {
  uid: string
  summary: string
  dtstart: string
  dtend?: string
  duration?: string
  description?: string
  location?: string
  allDay?: boolean
  recurrenceRule?: string
  status?: string
}): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fulcrum//CalDAV//EN',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${formatIcalDate(new Date())}`,
  ]

  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${toIcalDate(event.dtstart, true)}`)
    if (event.dtend) {
      lines.push(`DTEND;VALUE=DATE:${toIcalDate(event.dtend, true)}`)
    }
  } else {
    lines.push(`DTSTART:${toIcalDate(event.dtstart)}`)
    if (event.dtend) {
      lines.push(`DTEND:${toIcalDate(event.dtend)}`)
    }
  }

  if (event.duration) {
    lines.push(`DURATION:${event.duration}`)
  }

  lines.push(`SUMMARY:${escapeIcal(event.summary)}`)

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeIcal(event.description)}`)
  }
  if (event.location) {
    lines.push(`LOCATION:${escapeIcal(event.location)}`)
  }
  if (event.recurrenceRule) {
    lines.push(`RRULE:${event.recurrenceRule}`)
  }
  if (event.status) {
    lines.push(`STATUS:${event.status}`)
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')

  return lines.join('\r\n')
}

/**
 * Update a raw iCalendar string with new property values.
 * Preserves all existing properties not being updated.
 */
export function updateIcalEvent(rawIcal: string, updates: Partial<ParsedEvent>): string {
  const lines = unfoldIcal(rawIcal)
  const result: string[] = []
  let inVevent = false
  const appliedUpdates = new Set<string>()

  for (const line of lines) {
    const [key] = line.split(':')
    const propName = key.split(';')[0].toUpperCase()

    if (line === 'BEGIN:VEVENT') {
      inVevent = true
      result.push(line)
      continue
    }
    if (line === 'END:VEVENT') {
      // Add any new properties that weren't already in the event
      for (const [updateKey, value] of Object.entries(updates)) {
        if (!appliedUpdates.has(updateKey) && value !== undefined) {
          const newLine = propertyToIcalLine(updateKey, value)
          if (newLine) result.push(newLine)
        }
      }
      // Update DTSTAMP
      result.push(`DTSTAMP:${formatIcalDate(new Date())}`)
      inVevent = false
      result.push(line)
      continue
    }

    if (!inVevent) {
      result.push(line)
      continue
    }

    // Skip DTSTAMP - we'll add a new one
    if (propName === 'DTSTAMP') continue

    // Check if this property should be updated
    const updateKey = icalPropToUpdateKey(propName)
    if (updateKey && updateKey in updates) {
      const value = updates[updateKey as keyof ParsedEvent]
      if (value !== undefined) {
        const newLine = propertyToIcalLine(updateKey, value)
        if (newLine) result.push(newLine)
        appliedUpdates.add(updateKey)
      }
      continue
    }

    result.push(line)
  }

  return result.join('\r\n')
}

function icalPropToUpdateKey(prop: string): string | null {
  const map: Record<string, string> = {
    SUMMARY: 'summary',
    DESCRIPTION: 'description',
    LOCATION: 'location',
    DTSTART: 'dtstart',
    DTEND: 'dtend',
    DURATION: 'duration',
    RRULE: 'recurrenceRule',
    STATUS: 'status',
  }
  return map[prop] ?? null
}

function propertyToIcalLine(key: string, value: unknown): string | null {
  switch (key) {
    case 'summary': return `SUMMARY:${escapeIcal(String(value))}`
    case 'description': return `DESCRIPTION:${escapeIcal(String(value))}`
    case 'location': return `LOCATION:${escapeIcal(String(value))}`
    case 'dtstart': return `DTSTART:${toIcalDate(String(value))}`
    case 'dtend': return `DTEND:${toIcalDate(String(value))}`
    case 'duration': return `DURATION:${value}`
    case 'recurrenceRule': return `RRULE:${value}`
    case 'status': return `STATUS:${value}`
    default: return null
  }
}

/**
 * Unfold iCalendar lines (lines starting with space/tab are continuations).
 */
function unfoldIcal(ical: string): string[] {
  const rawLines = ical.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const result: string[] = []

  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && result.length > 0) {
      result[result.length - 1] += line.substring(1)
    } else {
      result.push(line)
    }
  }

  return result.filter(Boolean)
}

function escapeIcal(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function unescapeIcal(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

function formatIcalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/**
 * Convert ISO date to iCal format for writing to CalDAV servers.
 * - "2026-01-30" → "20260130" (all-day)
 * - "2026-01-30T09:00:00Z" → "20260130T090000Z"
 * - Already iCal format: returned as-is
 */
function toIcalDate(value: string, allDay?: boolean): string {
  // Already in iCal format (no dashes)
  if (!value.includes('-')) return value

  if (allDay) {
    // YYYY-MM-DD → YYYYMMDD
    return value.replace(/-/g, '').slice(0, 8)
  }

  // ISO → iCal: remove dashes and colons, strip milliseconds
  return value.replace(/-/g, '').replace(/:/g, '').replace(/\.\d{3}/, '')
}

