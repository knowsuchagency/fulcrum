import { describe, test, expect } from 'bun:test'
import { localToUTC, utcToLocal, icalDateToUTC, toUserTimezone, fromUserTimezone } from './timezone'

describe('timezone', () => {
  describe('localToUTC', () => {
    test('converts US Eastern to UTC (winter/EST = UTC-5)', () => {
      const result = localToUTC('2026-01-30T09:00:00', 'America/New_York')
      expect(result).toBe('2026-01-30T14:00:00Z')
    })

    test('converts US Pacific to UTC (winter/PST = UTC-8)', () => {
      const result = localToUTC('2026-02-04T15:00:00', 'America/Los_Angeles')
      expect(result).toBe('2026-02-04T23:00:00Z')
    })

    test('converts Europe/London (winter/GMT = UTC+0)', () => {
      const result = localToUTC('2026-01-30T12:00:00', 'Europe/London')
      expect(result).toBe('2026-01-30T12:00:00Z')
    })

    test('converts Asia/Tokyo (JST = UTC+9)', () => {
      const result = localToUTC('2026-01-30T18:00:00', 'Asia/Tokyo')
      expect(result).toBe('2026-01-30T09:00:00Z')
    })

    test('handles midnight crossing (local evening → next day UTC)', () => {
      const result = localToUTC('2026-01-30T22:00:00', 'America/New_York')
      expect(result).toBe('2026-01-31T03:00:00Z')
    })

    test('handles DST transition (US summer)', () => {
      // July: EDT = UTC-4
      const result = localToUTC('2026-07-15T09:00:00', 'America/New_York')
      expect(result).toBe('2026-07-15T13:00:00Z')
    })

    test('strips trailing Z from input if present', () => {
      const result = localToUTC('2026-01-30T12:00:00Z', 'UTC')
      expect(result).toBe('2026-01-30T12:00:00Z')
    })
  })

  describe('utcToLocal', () => {
    test('converts UTC to US Eastern (winter)', () => {
      const result = utcToLocal('2026-01-30T14:00:00Z', 'America/New_York')
      expect(result).toBe('2026-01-30T09:00:00')
    })

    test('converts UTC to US Pacific (winter)', () => {
      const result = utcToLocal('2026-02-04T23:00:00Z', 'America/Los_Angeles')
      expect(result).toBe('2026-02-04T15:00:00')
    })

    test('converts UTC to Asia/Tokyo', () => {
      const result = utcToLocal('2026-01-30T09:00:00Z', 'Asia/Tokyo')
      expect(result).toBe('2026-01-30T18:00:00')
    })

    test('result has no Z suffix (it is local time)', () => {
      const result = utcToLocal('2026-01-30T12:00:00Z', 'America/New_York')
      expect(result).not.toContain('Z')
    })
  })

  describe('localToUTC ↔ utcToLocal round-trip', () => {
    test('round-trips correctly for America/New_York', () => {
      const local = '2026-01-30T09:00:00'
      const tz = 'America/New_York'
      const utc = localToUTC(local, tz)
      const backToLocal = utcToLocal(utc, tz)
      expect(backToLocal).toBe(local)
    })

    test('round-trips correctly for Asia/Tokyo', () => {
      const local = '2026-06-15T18:30:00'
      const tz = 'Asia/Tokyo'
      const utc = localToUTC(local, tz)
      const backToLocal = utcToLocal(utc, tz)
      expect(backToLocal).toBe(local)
    })
  })

  describe('icalDateToUTC', () => {
    test('parses compact UTC date (Z suffix)', () => {
      const result = icalDateToUTC('20260130T090000Z', '')
      expect(result.iso).toBe('2026-01-30T09:00:00Z')
      expect(result.allDay).toBe(false)
    })

    test('parses compact date with TZID', () => {
      const result = icalDateToUTC('20260130T090000', 'TZID=America/New_York')
      expect(result.iso).toBe('2026-01-30T14:00:00Z')
      expect(result.allDay).toBe(false)
    })

    test('parses all-day date (VALUE=DATE)', () => {
      const result = icalDateToUTC('20260704', 'VALUE=DATE')
      expect(result.iso).toBe('2026-07-04')
      expect(result.allDay).toBe(true)
    })

    test('does not treat VALUE=DATE-TIME as all-day', () => {
      const result = icalDateToUTC('20260130T090000Z', 'VALUE=DATE-TIME')
      expect(result.allDay).toBe(false)
    })

    test('treats compact date without TZID as UTC (floating)', () => {
      const result = icalDateToUTC('20260130T150000', '')
      expect(result.iso).toBe('2026-01-30T15:00:00Z')
      expect(result.allDay).toBe(false)
    })

    test('passes through ISO format with Z', () => {
      const result = icalDateToUTC('2026-01-30T09:00:00Z', '')
      expect(result.iso).toBe('2026-01-30T09:00:00Z')
      expect(result.allDay).toBe(false)
    })

    test('handles ISO format with TZID', () => {
      const result = icalDateToUTC('2026-01-30T09:00:00', 'TZID=America/New_York')
      expect(result.iso).toBe('2026-01-30T14:00:00Z')
      expect(result.allDay).toBe(false)
    })

    test('handles ISO format floating (no Z, no TZID) as UTC', () => {
      const result = icalDateToUTC('2026-01-30T15:00:00', '')
      expect(result.iso).toBe('2026-01-30T15:00:00Z')
      expect(result.allDay).toBe(false)
    })

    test('handles all-day with ISO date format', () => {
      const result = icalDateToUTC('2026-07-04', 'VALUE=DATE')
      expect(result.iso).toBe('2026-07-04')
      expect(result.allDay).toBe(true)
    })

    test('returns value as-is for unparseable compact format', () => {
      const result = icalDateToUTC('invalid', '')
      expect(result.iso).toBe('invalid')
      expect(result.allDay).toBe(false)
    })
  })

  describe('toUserTimezone', () => {
    test('converts UTC timed event to user timezone', () => {
      const result = toUserTimezone('2026-01-30T14:00:00Z', 'America/New_York')
      expect(result).toBe('2026-01-30T09:00:00')
    })

    test('passes through all-day date unchanged', () => {
      const result = toUserTimezone('2026-07-04', 'America/New_York')
      expect(result).toBe('2026-07-04')
    })
  })

  describe('fromUserTimezone', () => {
    test('converts local time to UTC', () => {
      const result = fromUserTimezone('2026-01-30T09:00:00', 'America/New_York')
      expect(result).toBe('2026-01-30T14:00:00Z')
    })

    test('passes through UTC time unchanged', () => {
      const result = fromUserTimezone('2026-01-30T14:00:00Z', 'America/New_York')
      expect(result).toBe('2026-01-30T14:00:00Z')
    })

    test('passes through date-only unchanged', () => {
      const result = fromUserTimezone('2026-07-04', 'America/New_York')
      expect(result).toBe('2026-07-04')
    })
  })
})
