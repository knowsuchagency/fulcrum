/**
 * CalDAV API Routes
 *
 * Provides REST endpoints for CalDAV calendar integration:
 * connection management, calendar listing, and event CRUD.
 */

import { Hono } from 'hono'
import { fetchOauthTokens } from 'tsdav'
import {
  getCaldavStatus,
  testCaldavConnection,
  configureCaldav,
  configureGoogleOAuth,
  completeGoogleOAuth,
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
import { getSettings } from '../lib/settings'
import { getUserTimezone, toUserTimezone, fromUserTimezone } from '../services/caldav/timezone'
import type { CaldavEvent } from '../db'

// Google OAuth constants
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALDAV_SCOPE = 'https://www.googleapis.com/auth/calendar'

const caldavRoutes = new Hono()

/** Convert event dates from UTC (DB) to user's configured timezone. */
function localizeEvent(event: CaldavEvent, tz: string): CaldavEvent & { timezone: string } {
  return {
    ...event,
    dtstart: event.dtstart ? toUserTimezone(event.dtstart, tz) : null,
    dtend: event.dtend ? toUserTimezone(event.dtend, tz) : null,
    timezone: tz,
  }
}

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

// POST /api/caldav/configure-google — Save Google Client ID + Secret
caldavRoutes.post('/configure-google', async (c) => {
  const { googleClientId, googleClientSecret, syncIntervalMinutes } = await c.req.json<{
    googleClientId: string
    googleClientSecret: string
    syncIntervalMinutes?: number
  }>()

  if (!googleClientId || !googleClientSecret) {
    return c.json({ error: 'googleClientId and googleClientSecret are required' }, 400)
  }

  try {
    await configureGoogleOAuth({ googleClientId, googleClientSecret, syncIntervalMinutes })
    return c.json({ success: true })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'Configuration failed' },
      500
    )
  }
})

// GET /api/caldav/oauth/authorize — Build Google authorization URL
caldavRoutes.get('/oauth/authorize', (c) => {
  const settings = getSettings()
  const { googleClientId } = settings.caldav

  if (!googleClientId) {
    return c.json({ error: 'Google Client ID not configured. Call /configure-google first.' }, 400)
  }

  // Derive redirect URI from the request's Host header so it works in both
  // production (port from settings) and dev mode (arbitrary PORT env var).
  const host = c.req.header('host') ?? `localhost:${settings.server.port}`
  const redirectUri = `http://${host}/api/caldav/oauth/callback`

  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_CALDAV_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  })

  const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`
  return c.json({ authUrl })
})

// GET /api/caldav/oauth/callback — Receive auth code from Google redirect
caldavRoutes.get('/oauth/callback', async (c) => {
  const code = c.req.query('code')
  const error = c.req.query('error')

  if (error) {
    return c.html(`<html><body><h2>Authorization Failed</h2><p>${error}</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`)
  }

  if (!code) {
    return c.html('<html><body><h2>Missing authorization code</h2><script>setTimeout(()=>window.close(),3000)</script></body></html>', 400)
  }

  const settings = getSettings()
  const { googleClientId, googleClientSecret } = settings.caldav
  // Must match the redirect_uri used in the authorize request
  const host = c.req.header('host') ?? `localhost:${settings.server.port}`
  const redirectUri = `http://${host}/api/caldav/oauth/callback`

  if (!googleClientId || !googleClientSecret) {
    return c.html('<html><body><h2>Google OAuth not configured</h2><script>setTimeout(()=>window.close(),3000)</script></body></html>', 400)
  }

  try {
    const tokens = await fetchOauthTokens({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      authorizationCode: code,
      redirectUrl: redirectUri,
      tokenUrl: GOOGLE_TOKEN_URL,
    })

    if (!tokens.access_token || !tokens.refresh_token) {
      return c.html('<html><body><h2>Failed to obtain tokens</h2><p>Missing access or refresh token. Try again with prompt=consent.</p><script>setTimeout(()=>window.close(),5000)</script></body></html>', 500)
    }

    await completeGoogleOAuth({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in ?? 3600,
    })

    return c.html(`<html>
<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a;color:#fff">
<div style="text-align:center">
<h2 style="color:#22c55e">Connected to Google Calendar!</h2>
<p style="color:#a1a1aa">You can close this tab.</p>
<script>setTimeout(()=>window.close(),2000)</script>
</div>
</body>
</html>`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token exchange failed'
    return c.html(`<html><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a;color:#fff"><div style="text-align:center"><h2 style="color:#ef4444">Connection Failed</h2><p style="color:#a1a1aa">${message}</p><script>setTimeout(()=>window.close(),5000)</script></div></body></html>`, 500)
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
  const tz = getUserTimezone()

  // Convert user-local from/to to UTC for DB query
  const utcFrom = from ? fromUserTimezone(from, tz) : undefined
  const utcTo = to ? fromUserTimezone(to, tz) : undefined

  const events = listEvents({ calendarId: calendarId ?? undefined, from: utcFrom, to: utcTo, limit })
  return c.json(events.map(e => localizeEvent(e, tz)))
})

// GET /api/caldav/events/:id
caldavRoutes.get('/events/:id', (c) => {
  const event = getEvent(c.req.param('id'))
  if (!event) {
    return c.json({ error: 'Event not found' }, 404)
  }
  return c.json(localizeEvent(event, getUserTimezone()))
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

  // Convert user-local dates to UTC for storage
  const tz = getUserTimezone()
  const utcBody = {
    ...body,
    dtstart: fromUserTimezone(body.dtstart, tz),
    dtend: body.dtend ? fromUserTimezone(body.dtend, tz) : undefined,
  }

  try {
    const event = await createEvent(utcBody)
    return c.json(localizeEvent(event, tz), 201)
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

  // Convert user-local dates to UTC for storage
  const tz = getUserTimezone()
  const utcBody = {
    ...body,
    dtstart: body.dtstart ? fromUserTimezone(body.dtstart, tz) : undefined,
    dtend: body.dtend ? fromUserTimezone(body.dtend, tz) : undefined,
  }

  try {
    const event = await updateEvent(id, utcBody)
    return c.json(localizeEvent(event, tz))
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
