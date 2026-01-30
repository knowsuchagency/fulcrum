import { describe, test, expect } from 'bun:test'
import { parseIcalEvent, generateIcalEvent, updateIcalEvent } from './ical-helpers'

describe('ical-helpers', () => {
  describe('parseIcalEvent', () => {
    test('parses a basic VEVENT', () => {
      const ical = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:abc-123',
        'SUMMARY:Team Meeting',
        'DTSTART:20260130T090000Z',
        'DTEND:20260130T100000Z',
        'LOCATION:Room 42',
        'DESCRIPTION:Weekly sync',
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n')

      const result = parseIcalEvent(ical)
      expect(result.uid).toBe('abc-123')
      expect(result.summary).toBe('Team Meeting')
      expect(result.dtstart).toBe('2026-01-30T09:00:00Z')
      expect(result.dtend).toBe('2026-01-30T10:00:00Z')
      expect(result.location).toBe('Room 42')
      expect(result.description).toBe('Weekly sync')
      expect(result.status).toBe('CONFIRMED')
      expect(result.allDay).toBe(false)
    })

    test('parses all-day event (VALUE=DATE)', () => {
      const ical = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:day-1',
        'SUMMARY:Holiday',
        'DTSTART;VALUE=DATE:20260704',
        'DTEND;VALUE=DATE:20260705',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n')

      const result = parseIcalEvent(ical)
      expect(result.allDay).toBe(true)
      expect(result.dtstart).toBe('2026-07-04')
      expect(result.dtend).toBe('2026-07-05')
    })

    test('parses event with TZID parameter', () => {
      const ical = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:tz-1',
        'SUMMARY:Local Event',
        'DTSTART;TZID=America/New_York:20260130T090000',
        'DTEND;TZID=America/New_York:20260130T100000',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n')

      const result = parseIcalEvent(ical)
      // Should be converted to UTC
      expect(result.dtstart).toBe('2026-01-30T14:00:00Z')
      expect(result.dtend).toBe('2026-01-30T15:00:00Z')
      expect(result.allDay).toBe(false)
    })

    test('parses attendees and organizer', () => {
      const ical = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:att-1',
        'SUMMARY:Review',
        'DTSTART:20260130T090000Z',
        'ORGANIZER:mailto:boss@example.com',
        'ATTENDEE:mailto:alice@example.com',
        'ATTENDEE:mailto:bob@example.com',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n')

      const result = parseIcalEvent(ical)
      expect(result.organizer).toBe('boss@example.com')
      expect(result.attendees).toEqual(['alice@example.com', 'bob@example.com'])
    })

    test('unescapes special characters', () => {
      const ical = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:esc-1',
        'SUMMARY:Hello\\, World\\; Greetings\\n(line two)',
        'DESCRIPTION:Line one\\nLine two\\\\backslash',
        'DTSTART:20260130T090000Z',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n')

      const result = parseIcalEvent(ical)
      expect(result.summary).toBe('Hello, World; Greetings\n(line two)')
      expect(result.description).toBe('Line one\nLine two\\backslash')
    })

    test('handles line folding (continuation lines)', () => {
      // RFC 5545: continuation lines start with a space/tab; the leading whitespace is stripped
      // and the remainder is concatenated directly (no extra space added)
      const ical = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:fold-1',
        'SUMMARY:This is a very long summary that gets ',
        ' folded across multiple lines',
        'DTSTART:20260130T090000Z',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n')

      const result = parseIcalEvent(ical)
      expect(result.summary).toBe('This is a very long summary that gets folded across multiple lines')
    })

    test('ignores properties outside VEVENT (e.g., VTIMEZONE)', () => {
      const ical = [
        'BEGIN:VCALENDAR',
        'BEGIN:VTIMEZONE',
        'TZID:America/New_York',
        'SUMMARY:Should be ignored',
        'END:VTIMEZONE',
        'BEGIN:VEVENT',
        'UID:scope-1',
        'SUMMARY:Real Event',
        'DTSTART:20260130T090000Z',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n')

      const result = parseIcalEvent(ical)
      expect(result.summary).toBe('Real Event')
      expect(result.uid).toBe('scope-1')
    })

    test('parses DURATION and RRULE', () => {
      const ical = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:dur-1',
        'SUMMARY:Recurring',
        'DTSTART:20260130T090000Z',
        'DURATION:PT1H30M',
        'RRULE:FREQ=WEEKLY;COUNT=10',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n')

      const result = parseIcalEvent(ical)
      expect(result.duration).toBe('PT1H30M')
      expect(result.recurrenceRule).toBe('FREQ=WEEKLY;COUNT=10')
    })

    test('handles value containing colons (e.g. URL in description)', () => {
      const ical = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:colon-1',
        'SUMMARY:Meeting',
        'DESCRIPTION:Join at https://meet.example.com/room:42',
        'DTSTART:20260130T090000Z',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n')

      const result = parseIcalEvent(ical)
      expect(result.description).toBe('Join at https://meet.example.com/room:42')
    })
  })

  describe('generateIcalEvent', () => {
    test('generates a basic timed event', () => {
      const result = generateIcalEvent({
        uid: 'gen-1',
        summary: 'Test Event',
        dtstart: '2026-01-30T09:00:00Z',
        dtend: '2026-01-30T10:00:00Z',
      })

      expect(result).toContain('BEGIN:VCALENDAR')
      expect(result).toContain('VERSION:2.0')
      expect(result).toContain('PRODID:-//Fulcrum//CalDAV//EN')
      expect(result).toContain('BEGIN:VEVENT')
      expect(result).toContain('UID:gen-1')
      expect(result).toContain('SUMMARY:Test Event')
      expect(result).toContain('DTSTART:20260130T090000Z')
      expect(result).toContain('DTEND:20260130T100000Z')
      expect(result).toContain('END:VEVENT')
      expect(result).toContain('END:VCALENDAR')
    })

    test('generates an all-day event', () => {
      const result = generateIcalEvent({
        uid: 'allday-1',
        summary: 'Vacation',
        dtstart: '2026-07-04',
        dtend: '2026-07-06',
        allDay: true,
      })

      expect(result).toContain('DTSTART;VALUE=DATE:20260704')
      expect(result).toContain('DTEND;VALUE=DATE:20260706')
    })

    test('includes optional properties', () => {
      const result = generateIcalEvent({
        uid: 'opt-1',
        summary: 'Full Event',
        dtstart: '2026-01-30T09:00:00Z',
        description: 'Detailed description',
        location: 'Conference Room',
        duration: 'PT2H',
        recurrenceRule: 'FREQ=DAILY;COUNT=5',
        status: 'TENTATIVE',
      })

      expect(result).toContain('DESCRIPTION:Detailed description')
      expect(result).toContain('LOCATION:Conference Room')
      expect(result).toContain('DURATION:PT2H')
      expect(result).toContain('RRULE:FREQ=DAILY;COUNT=5')
      expect(result).toContain('STATUS:TENTATIVE')
    })

    test('escapes special characters in output', () => {
      const result = generateIcalEvent({
        uid: 'esc-out-1',
        summary: 'Hello, World; Greetings',
        dtstart: '2026-01-30T09:00:00Z',
        description: 'Line one\nLine two',
      })

      expect(result).toContain('SUMMARY:Hello\\, World\\; Greetings')
      expect(result).toContain('DESCRIPTION:Line one\\nLine two')
    })

    test('omits dtend and optional fields when not provided', () => {
      const result = generateIcalEvent({
        uid: 'min-1',
        summary: 'Minimal',
        dtstart: '2026-01-30T09:00:00Z',
      })

      expect(result).not.toContain('DTEND')
      expect(result).not.toContain('DESCRIPTION')
      expect(result).not.toContain('LOCATION')
      expect(result).not.toContain('DURATION')
      expect(result).not.toContain('RRULE')
      expect(result).not.toContain('STATUS')
    })
  })

  describe('updateIcalEvent', () => {
    const baseIcal = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:upd-1',
      'DTSTAMP:20260101T000000Z',
      'SUMMARY:Original Title',
      'DESCRIPTION:Original description',
      'LOCATION:Room A',
      'DTSTART:20260130T090000Z',
      'DTEND:20260130T100000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')

    test('updates summary', () => {
      const result = updateIcalEvent(baseIcal, { summary: 'New Title' })
      expect(result).toContain('SUMMARY:New Title')
      expect(result).not.toContain('SUMMARY:Original Title')
    })

    test('updates multiple properties', () => {
      const result = updateIcalEvent(baseIcal, {
        summary: 'Updated',
        location: 'Room B',
        description: 'New desc',
      })

      expect(result).toContain('SUMMARY:Updated')
      expect(result).toContain('LOCATION:Room B')
      expect(result).toContain('DESCRIPTION:New desc')
    })

    test('preserves properties not being updated', () => {
      const result = updateIcalEvent(baseIcal, { summary: 'Changed' })
      expect(result).toContain('UID:upd-1')
      expect(result).toContain('LOCATION:Room A')
      expect(result).toContain('DTSTART:20260130T090000Z')
    })

    test('preserves VCALENDAR wrapper', () => {
      const result = updateIcalEvent(baseIcal, { summary: 'Changed' })
      expect(result).toContain('BEGIN:VCALENDAR')
      expect(result).toContain('VERSION:2.0')
      expect(result).toContain('END:VCALENDAR')
    })

    test('updates DTSTAMP', () => {
      const result = updateIcalEvent(baseIcal, { summary: 'Changed' })
      // Old DTSTAMP should be replaced with a new one
      expect(result).not.toContain('DTSTAMP:20260101T000000Z')
      expect(result).toContain('DTSTAMP:')
    })

    test('adds new properties not in original', () => {
      const minimalIcal = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:add-1',
        'SUMMARY:Basic',
        'DTSTART:20260130T090000Z',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n')

      const result = updateIcalEvent(minimalIcal, {
        location: 'New Location',
        status: 'CONFIRMED',
      })

      expect(result).toContain('LOCATION:New Location')
      expect(result).toContain('STATUS:CONFIRMED')
    })
  })
})
