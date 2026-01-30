/**
 * CalDAV Service
 *
 * Provides native CalDAV calendar integration with:
 * - Calendar discovery and sync
 * - Event CRUD with lossless round-tripping via rawIcal
 * - Periodic background sync
 * - Connection testing and lifecycle management
 */

import { DAVClient } from 'tsdav'
import { eq, and, gte, lte, desc } from 'drizzle-orm'
import { db, caldavCalendars, caldavEvents } from '../../db'
import type { CaldavCalendar, CaldavEvent } from '../../db'
import type { CalDavSettings } from '../../lib/settings/types'
import { getSettings } from '../../lib/settings'
import { createLogger } from '../../lib/logger'
import { parseIcalEvent, generateIcalEvent, updateIcalEvent } from './ical-helpers'

const logger = createLogger('CalDAV')

// Service state
let davClient: DAVClient | null = null
let syncInterval: ReturnType<typeof setInterval> | null = null
let isSyncing = false
let lastSyncError: string | null = null
let retryCount = 0
const MAX_RETRY_DELAY = 5 * 60 * 1000 // 5 minutes

// --- Lifecycle ---

export async function startCaldavSync(): Promise<void> {
  const settings = getSettings()
  if (!settings.caldav?.enabled) {
    logger.info('CalDAV disabled, skipping sync start')
    return
  }

  try {
    await connect(settings.caldav)
    scheduleSync(settings.caldav.syncIntervalMinutes)
    // Initial sync
    await syncAllCalendars()
    retryCount = 0
  } catch (err) {
    lastSyncError = err instanceof Error ? err.message : String(err)
    logger.error('Failed to start CalDAV sync', { error: lastSyncError })
    scheduleRetry(settings.caldav)
  }
}

export function stopCaldavSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
  davClient = null
  isSyncing = false
  logger.info('CalDAV sync stopped')
}

export function getCaldavStatus(): {
  connected: boolean
  syncing: boolean
  lastError: string | null
  calendarCount: number
} {
  const calendars = db.select().from(caldavCalendars).all()
  return {
    connected: davClient !== null,
    syncing: isSyncing,
    lastError: lastSyncError,
    calendarCount: calendars.length,
  }
}

// --- Configuration ---

export async function testCaldavConnection(config: {
  serverUrl: string
  username: string
  password: string
}): Promise<{ success: boolean; calendars?: number; error?: string }> {
  try {
    const client = new DAVClient({
      serverUrl: config.serverUrl,
      credentials: {
        username: config.username,
        password: config.password,
      },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    })
    await client.login()
    const calendars = await client.fetchCalendars()
    return { success: true, calendars: calendars.length }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function configureCaldav(config: {
  serverUrl: string
  username: string
  password: string
  syncIntervalMinutes?: number
}): Promise<void> {
  // Import dynamically to avoid circular dependency
  const { updateSettingByPath } = await import('../../lib/settings')

  await updateSettingByPath('caldav.serverUrl', config.serverUrl)
  await updateSettingByPath('caldav.username', config.username)
  await updateSettingByPath('caldav.password', config.password)
  if (config.syncIntervalMinutes !== undefined) {
    await updateSettingByPath('caldav.syncIntervalMinutes', config.syncIntervalMinutes)
  }
  await updateSettingByPath('caldav.enabled', true)

  // Restart sync with new config
  stopCaldavSync()
  await startCaldavSync()
}

export async function enableCaldav(): Promise<void> {
  const { updateSettingByPath } = await import('../../lib/settings')
  await updateSettingByPath('caldav.enabled', true)
  await startCaldavSync()
}

export async function disableCaldav(): Promise<void> {
  const { updateSettingByPath } = await import('../../lib/settings')
  await updateSettingByPath('caldav.enabled', false)
  stopCaldavSync()
}

// --- Calendar Operations ---

export function listCalendars(): CaldavCalendar[] {
  return db.select().from(caldavCalendars).all()
}

export async function syncCalendars(): Promise<void> {
  await syncAllCalendars()
}

// --- Event Operations ---

export function listEvents(options?: {
  calendarId?: string
  from?: string
  to?: string
  limit?: number
}): CaldavEvent[] {
  const conditions = []

  if (options?.calendarId) {
    conditions.push(eq(caldavEvents.calendarId, options.calendarId))
  }
  if (options?.from) {
    conditions.push(gte(caldavEvents.dtstart, options.from))
  }
  if (options?.to) {
    conditions.push(lte(caldavEvents.dtstart, options.to))
  }

  const query = db
    .select()
    .from(caldavEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(caldavEvents.dtstart))

  if (options?.limit) {
    return query.limit(options.limit).all()
  }

  return query.all()
}

export function getEvent(id: string): CaldavEvent | undefined {
  return db.select().from(caldavEvents).where(eq(caldavEvents.id, id)).get()
}

export async function createEvent(input: {
  calendarId: string
  summary: string
  dtstart: string
  dtend?: string
  duration?: string
  description?: string
  location?: string
  allDay?: boolean
  recurrenceRule?: string
  status?: string
}): Promise<CaldavEvent> {
  ensureConnected()

  // Find the calendar
  const calendar = db
    .select()
    .from(caldavCalendars)
    .where(eq(caldavCalendars.id, input.calendarId))
    .get()

  if (!calendar) {
    throw new Error(`Calendar not found: ${input.calendarId}`)
  }

  const uid = `${crypto.randomUUID()}@fulcrum`
  const ical = generateIcalEvent({
    uid,
    summary: input.summary,
    dtstart: input.dtstart,
    dtend: input.dtend,
    duration: input.duration,
    description: input.description,
    location: input.location,
    allDay: input.allDay,
    recurrenceRule: input.recurrenceRule,
    status: input.status,
  })

  // Create on CalDAV server
  const eventUrl = `${calendar.remoteUrl}${uid}.ics`
  await davClient!.createCalendarObject({
    calendar: { url: calendar.remoteUrl },
    filename: `${uid}.ics`,
    iCalString: ical,
  })

  // Insert locally
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const event: CaldavEvent = {
    id,
    calendarId: input.calendarId,
    remoteUrl: eventUrl,
    uid,
    etag: null,
    summary: input.summary,
    description: input.description ?? null,
    location: input.location ?? null,
    dtstart: input.dtstart,
    dtend: input.dtend ?? null,
    duration: input.duration ?? null,
    allDay: input.allDay ?? false,
    recurrenceRule: input.recurrenceRule ?? null,
    status: input.status ?? null,
    organizer: null,
    attendees: null,
    rawIcal: ical,
    createdAt: now,
    updatedAt: now,
  }

  db.insert(caldavEvents).values(event).run()
  logger.info('Created CalDAV event', { id, summary: input.summary })

  return event
}

export async function updateEvent(
  id: string,
  updates: {
    summary?: string
    dtstart?: string
    dtend?: string
    duration?: string
    description?: string
    location?: string
    allDay?: boolean
    recurrenceRule?: string
    status?: string
  }
): Promise<CaldavEvent> {
  ensureConnected()

  const event = db.select().from(caldavEvents).where(eq(caldavEvents.id, id)).get()
  if (!event) {
    throw new Error(`Event not found: ${id}`)
  }

  // Update the iCal using the raw source for lossless round-tripping
  const updatedIcal = event.rawIcal
    ? updateIcalEvent(event.rawIcal, updates)
    : generateIcalEvent({
        uid: event.uid || crypto.randomUUID(),
        summary: updates.summary ?? event.summary ?? 'Untitled',
        dtstart: updates.dtstart ?? event.dtstart ?? new Date().toISOString(),
        dtend: updates.dtend ?? event.dtend ?? undefined,
        duration: updates.duration ?? event.duration ?? undefined,
        description: updates.description ?? event.description ?? undefined,
        location: updates.location ?? event.location ?? undefined,
        allDay: updates.allDay ?? event.allDay ?? false,
        recurrenceRule: updates.recurrenceRule ?? event.recurrenceRule ?? undefined,
        status: updates.status ?? event.status ?? undefined,
      })

  // Update on CalDAV server
  await davClient!.updateCalendarObject({
    calendarObject: {
      url: event.remoteUrl,
      etag: event.etag ?? undefined,
    },
    iCalString: updatedIcal,
  })

  // Update locally
  const now = new Date().toISOString()
  db.update(caldavEvents)
    .set({
      summary: updates.summary ?? event.summary,
      description: updates.description ?? event.description,
      location: updates.location ?? event.location,
      dtstart: updates.dtstart ?? event.dtstart,
      dtend: updates.dtend ?? event.dtend,
      duration: updates.duration ?? event.duration,
      allDay: updates.allDay ?? event.allDay,
      recurrenceRule: updates.recurrenceRule ?? event.recurrenceRule,
      status: updates.status ?? event.status,
      rawIcal: updatedIcal,
      updatedAt: now,
    })
    .where(eq(caldavEvents.id, id))
    .run()

  logger.info('Updated CalDAV event', { id, summary: updates.summary ?? event.summary })

  return db.select().from(caldavEvents).where(eq(caldavEvents.id, id)).get()!
}

export async function deleteEvent(id: string): Promise<void> {
  ensureConnected()

  const event = db.select().from(caldavEvents).where(eq(caldavEvents.id, id)).get()
  if (!event) {
    throw new Error(`Event not found: ${id}`)
  }

  // Delete from CalDAV server
  await davClient!.deleteCalendarObject({
    calendarObject: {
      url: event.remoteUrl,
      etag: event.etag ?? undefined,
    },
  })

  // Delete locally
  db.delete(caldavEvents).where(eq(caldavEvents.id, id)).run()
  logger.info('Deleted CalDAV event', { id, summary: event.summary })
}

// --- Internal ---

async function connect(config: CalDavSettings): Promise<void> {
  davClient = new DAVClient({
    serverUrl: config.serverUrl,
    credentials: {
      username: config.username,
      password: config.password,
    },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  })
  await davClient.login()
  logger.info('Connected to CalDAV server', { serverUrl: config.serverUrl })
}

function ensureConnected(): void {
  if (!davClient) {
    throw new Error('CalDAV not connected. Enable CalDAV in settings first.')
  }
}

function scheduleSync(intervalMinutes: number): void {
  if (syncInterval) {
    clearInterval(syncInterval)
  }
  syncInterval = setInterval(
    () => {
      syncAllCalendars().catch((err) => {
        lastSyncError = err instanceof Error ? err.message : String(err)
        logger.error('CalDAV sync failed', { error: lastSyncError })
      })
    },
    intervalMinutes * 60 * 1000
  )
}

function scheduleRetry(config: CalDavSettings): void {
  retryCount++
  const delay = Math.min(1000 * Math.pow(2, retryCount), MAX_RETRY_DELAY)
  logger.info('Scheduling CalDAV retry', { retryCount, delayMs: delay })

  setTimeout(async () => {
    try {
      await connect(config)
      scheduleSync(config.syncIntervalMinutes)
      await syncAllCalendars()
      retryCount = 0
      lastSyncError = null
    } catch (err) {
      lastSyncError = err instanceof Error ? err.message : String(err)
      logger.error('CalDAV retry failed', { error: lastSyncError })
      scheduleRetry(config)
    }
  }, delay)
}

async function syncAllCalendars(): Promise<void> {
  if (isSyncing || !davClient) return

  isSyncing = true
  try {
    // Fetch all calendars from server
    const remoteCalendars = await davClient.fetchCalendars()
    const now = new Date().toISOString()

    // Track which remote URLs we've seen
    const seenUrls = new Set<string>()

    for (const remoteCal of remoteCalendars) {
      const url = remoteCal.url
      seenUrls.add(url)

      // Check if we already have this calendar
      const existing = db
        .select()
        .from(caldavCalendars)
        .where(eq(caldavCalendars.remoteUrl, url))
        .get()

      const ctag = remoteCal.ctag ?? remoteCal.syncToken ?? null

      if (existing) {
        // Check if calendar has changed (via ctag)
        const changed = !ctag || ctag !== existing.ctag

        db.update(caldavCalendars)
          .set({
            displayName: remoteCal.displayName ?? existing.displayName,
            ctag,
            syncToken: remoteCal.syncToken ?? existing.syncToken,
            updatedAt: now,
            lastSyncedAt: now,
          })
          .where(eq(caldavCalendars.id, existing.id))
          .run()

        if (changed && existing.enabled) {
          await syncCalendarEvents(existing.id, remoteCal)
        }
      } else {
        // New calendar
        const id = crypto.randomUUID()
        db.insert(caldavCalendars)
          .values({
            id,
            remoteUrl: url,
            displayName: remoteCal.displayName ?? 'Unnamed Calendar',
            ctag,
            syncToken: remoteCal.syncToken ?? null,
            color: null,
            timezone: null,
            enabled: true,
            lastSyncedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .run()

        await syncCalendarEvents(id, remoteCal)
      }
    }

    // Remove calendars that no longer exist on server
    const localCalendars = db.select().from(caldavCalendars).all()
    for (const local of localCalendars) {
      if (!seenUrls.has(local.remoteUrl)) {
        db.delete(caldavEvents)
          .where(eq(caldavEvents.calendarId, local.id))
          .run()
        db.delete(caldavCalendars)
          .where(eq(caldavCalendars.id, local.id))
          .run()
        logger.info('Removed deleted calendar', { displayName: local.displayName })
      }
    }

    lastSyncError = null
    logger.info('CalDAV sync complete', { calendars: remoteCalendars.length })
  } finally {
    isSyncing = false
  }
}

async function syncCalendarEvents(
  calendarId: string,
  remoteCal: { url: string }
): Promise<void> {
  if (!davClient) return

  const calendarObjects = await davClient.fetchCalendarObjects({
    calendar: { url: remoteCal.url },
  })

  const now = new Date().toISOString()
  const seenUrls = new Set<string>()

  for (const obj of calendarObjects) {
    if (!obj.data) continue

    const url = obj.url
    seenUrls.add(url)
    const parsed = parseIcalEvent(obj.data)

    const existing = db
      .select()
      .from(caldavEvents)
      .where(eq(caldavEvents.remoteUrl, url))
      .get()

    if (existing) {
      // Update if etag changed
      if (obj.etag !== existing.etag) {
        db.update(caldavEvents)
          .set({
            uid: parsed.uid ?? existing.uid,
            etag: obj.etag ?? existing.etag,
            summary: parsed.summary ?? existing.summary,
            description: parsed.description ?? existing.description,
            location: parsed.location ?? existing.location,
            dtstart: parsed.dtstart ?? existing.dtstart,
            dtend: parsed.dtend ?? existing.dtend,
            duration: parsed.duration ?? existing.duration,
            allDay: parsed.allDay,
            recurrenceRule: parsed.recurrenceRule ?? existing.recurrenceRule,
            status: parsed.status ?? existing.status,
            organizer: parsed.organizer ?? existing.organizer,
            attendees: parsed.attendees ?? existing.attendees,
            rawIcal: obj.data,
            updatedAt: now,
          })
          .where(eq(caldavEvents.id, existing.id))
          .run()
      }
    } else {
      // New event
      db.insert(caldavEvents)
        .values({
          id: crypto.randomUUID(),
          calendarId,
          remoteUrl: url,
          uid: parsed.uid ?? null,
          etag: obj.etag ?? null,
          summary: parsed.summary ?? null,
          description: parsed.description ?? null,
          location: parsed.location ?? null,
          dtstart: parsed.dtstart ?? null,
          dtend: parsed.dtend ?? null,
          duration: parsed.duration ?? null,
          allDay: parsed.allDay,
          recurrenceRule: parsed.recurrenceRule ?? null,
          status: parsed.status ?? null,
          organizer: parsed.organizer ?? null,
          attendees: parsed.attendees ?? null,
          rawIcal: obj.data,
          createdAt: now,
          updatedAt: now,
        })
        .run()
    }
  }

  // Remove events no longer on server
  const localEvents = db
    .select()
    .from(caldavEvents)
    .where(eq(caldavEvents.calendarId, calendarId))
    .all()

  for (const local of localEvents) {
    if (!seenUrls.has(local.remoteUrl)) {
      db.delete(caldavEvents).where(eq(caldavEvents.id, local.id)).run()
    }
  }
}
