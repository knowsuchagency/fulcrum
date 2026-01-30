/**
 * CalDAV API Routes
 *
 * Provides REST endpoints for CalDAV calendar integration:
 * connection management, calendar listing, and event CRUD.
 */

import { Hono } from 'hono'
import {
  getCaldavStatus,
  testCaldavConnection,
  configureCaldav,
  enableCaldav,
  disableCaldav,
  listCalendars,
  syncCalendars,
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
} from '../services/caldav'

const caldavRoutes = new Hono()

// GET /api/caldav/status
caldavRoutes.get('/status', (c) => {
  const status = getCaldavStatus()
  return c.json(status)
})

// POST /api/caldav/test
caldavRoutes.post('/test', async (c) => {
  const { serverUrl, username, password } = await c.req.json<{
    serverUrl: string
    username: string
    password: string
  }>()

  if (!serverUrl || !username || !password) {
    return c.json({ error: 'serverUrl, username, and password are required' }, 400)
  }

  const result = await testCaldavConnection({ serverUrl, username, password })
  return c.json(result)
})

// POST /api/caldav/configure
caldavRoutes.post('/configure', async (c) => {
  const body = await c.req.json<{
    serverUrl: string
    username: string
    password: string
    syncIntervalMinutes?: number
  }>()

  if (!body.serverUrl || !body.username || !body.password) {
    return c.json({ error: 'serverUrl, username, and password are required' }, 400)
  }

  try {
    await configureCaldav(body)
    return c.json({ success: true })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'Configuration failed' },
      500
    )
  }
})

// POST /api/caldav/enable
caldavRoutes.post('/enable', async (c) => {
  try {
    await enableCaldav()
    return c.json({ success: true })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'Failed to enable CalDAV' },
      500
    )
  }
})

// POST /api/caldav/disable
caldavRoutes.post('/disable', async (c) => {
  try {
    await disableCaldav()
    return c.json({ success: true })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'Failed to disable CalDAV' },
      500
    )
  }
})

// POST /api/caldav/sync
caldavRoutes.post('/sync', async (c) => {
  try {
    await syncCalendars()
    return c.json({ success: true })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      500
    )
  }
})

// GET /api/caldav/calendars
caldavRoutes.get('/calendars', (c) => {
  const calendars = listCalendars()
  return c.json(calendars)
})

// GET /api/caldav/events
caldavRoutes.get('/events', (c) => {
  const calendarId = c.req.query('calendarId')
  const from = c.req.query('from')
  const to = c.req.query('to')
  const limitStr = c.req.query('limit')
  const limit = limitStr ? parseInt(limitStr, 10) : undefined

  const events = listEvents({ calendarId: calendarId ?? undefined, from: from ?? undefined, to: to ?? undefined, limit })
  return c.json(events)
})

// GET /api/caldav/events/:id
caldavRoutes.get('/events/:id', (c) => {
  const event = getEvent(c.req.param('id'))
  if (!event) {
    return c.json({ error: 'Event not found' }, 404)
  }
  return c.json(event)
})

// POST /api/caldav/events
caldavRoutes.post('/events', async (c) => {
  const body = await c.req.json<{
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
  }>()

  if (!body.calendarId || !body.summary || !body.dtstart) {
    return c.json({ error: 'calendarId, summary, and dtstart are required' }, 400)
  }

  try {
    const event = await createEvent(body)
    return c.json(event, 201)
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'Failed to create event' },
      500
    )
  }
})

// PATCH /api/caldav/events/:id
caldavRoutes.patch('/events/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{
    summary?: string
    dtstart?: string
    dtend?: string
    duration?: string
    description?: string
    location?: string
    allDay?: boolean
    recurrenceRule?: string
    status?: string
  }>()

  try {
    const event = await updateEvent(id, body)
    return c.json(event)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update event'
    if (message.includes('not found')) {
      return c.json({ error: message }, 404)
    }
    return c.json({ error: message }, 500)
  }
})

// DELETE /api/caldav/events/:id
caldavRoutes.delete('/events/:id', async (c) => {
  const id = c.req.param('id')

  try {
    await deleteEvent(id)
    return c.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete event'
    if (message.includes('not found')) {
      return c.json({ error: message }, 404)
    }
    return c.json({ error: message }, 500)
  }
})

export default caldavRoutes
