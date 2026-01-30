/**
 * CalDAV route tests
 *
 * Tests the REST API endpoints for CalDAV calendar integration.
 * Service-level calls (sync, connect) are not tested here since they
 * require a live CalDAV server — only input validation and DB-backed
 * endpoints (status, calendars, events) are covered.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestApp } from '../__tests__/fixtures/app'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'

describe('CalDAV Routes', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('GET /api/caldav/status', () => {
    test('returns status object', async () => {
      const { get } = createTestApp()
      const res = await get('/api/caldav/status')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toHaveProperty('connected')
      expect(body).toHaveProperty('syncing')
      expect(body).toHaveProperty('calendarCount')
      expect(typeof body.connected).toBe('boolean')
      expect(typeof body.syncing).toBe('boolean')
    })

    test('returns disconnected by default', async () => {
      const { get } = createTestApp()
      const res = await get('/api/caldav/status')
      const body = await res.json()

      expect(body.connected).toBe(false)
      expect(body.calendarCount).toBe(0)
    })
  })

  describe('POST /api/caldav/test', () => {
    test('returns 400 when serverUrl missing', async () => {
      const { post } = createTestApp()
      const res = await post('/api/caldav/test', {
        username: 'user',
        password: 'pass',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('serverUrl')
    })

    test('returns 400 when username missing', async () => {
      const { post } = createTestApp()
      const res = await post('/api/caldav/test', {
        serverUrl: 'https://example.com/dav',
        password: 'pass',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('username')
    })

    test('returns 400 when password missing', async () => {
      const { post } = createTestApp()
      const res = await post('/api/caldav/test', {
        serverUrl: 'https://example.com/dav',
        username: 'user',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('password')
    })
  })

  describe('POST /api/caldav/configure', () => {
    test('returns 400 when required fields missing', async () => {
      const { post } = createTestApp()
      const res = await post('/api/caldav/configure', {
        serverUrl: 'https://example.com/dav',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('required')
    })
  })

  describe('POST /api/caldav/configure-google', () => {
    test('returns 400 when clientId missing', async () => {
      const { post } = createTestApp()
      const res = await post('/api/caldav/configure-google', {
        googleClientSecret: 'secret-123',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('googleClientId')
    })

    test('returns 400 when clientSecret missing', async () => {
      const { post } = createTestApp()
      const res = await post('/api/caldav/configure-google', {
        googleClientId: 'client-id-123',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('googleClientSecret')
    })
  })

  describe('GET /api/caldav/oauth/authorize', () => {
    test('returns 400 when Google Client ID not configured', async () => {
      const { get } = createTestApp()
      const res = await get('/api/caldav/oauth/authorize')
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('Client ID not configured')
    })

    test('returns auth URL when Google is configured', async () => {
      const { put, get } = createTestApp()

      // Configure Google client ID first
      await put('/api/config/caldav.googleClientId', { value: 'test-client-id.apps.googleusercontent.com' })
      await put('/api/config/caldav.googleClientSecret', { value: 'test-secret' })

      const res = await get('/api/caldav/oauth/authorize')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.authUrl).toContain('accounts.google.com')
      expect(body.authUrl).toContain('test-client-id.apps.googleusercontent.com')
      expect(body.authUrl).toContain('calendar')
    })
  })

  describe('GET /api/caldav/oauth/callback', () => {
    test('returns error HTML when error param present', async () => {
      const { request } = createTestApp()
      const res = await request('/api/caldav/oauth/callback?error=access_denied')
      const text = await res.text()

      expect(res.status).toBe(200) // HTML error page, not HTTP error
      expect(text).toContain('Authorization Failed')
      expect(text).toContain('access_denied')
    })

    test('returns 400 when no code and no error', async () => {
      const { request } = createTestApp()
      const res = await request('/api/caldav/oauth/callback')
      const text = await res.text()

      expect(res.status).toBe(400)
      expect(text).toContain('Missing authorization code')
    })
  })

  describe('GET /api/caldav/calendars', () => {
    test('returns empty array when not connected', async () => {
      const { get } = createTestApp()
      const res = await get('/api/caldav/calendars')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBe(0)
    })
  })

  describe('GET /api/caldav/events', () => {
    test('returns empty array when no events', async () => {
      const { get } = createTestApp()
      const res = await get('/api/caldav/events')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBe(0)
    })

    test('accepts query parameters', async () => {
      const { get } = createTestApp()
      const res = await get('/api/caldav/events?from=2026-01-01&to=2026-12-31&limit=10')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(Array.isArray(body)).toBe(true)
    })
  })

  describe('GET /api/caldav/events/:id', () => {
    test('returns 404 for nonexistent event', async () => {
      const { get } = createTestApp()
      const res = await get('/api/caldav/events/nonexistent-id')
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toContain('not found')
    })
  })

  describe('POST /api/caldav/events', () => {
    test('returns 400 when required fields missing', async () => {
      const { post } = createTestApp()
      const res = await post('/api/caldav/events', {
        summary: 'Test Event',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('required')
    })

    test('returns 400 when summary missing', async () => {
      const { post } = createTestApp()
      const res = await post('/api/caldav/events', {
        calendarId: 'cal-1',
        dtstart: '2026-01-30T09:00:00',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('required')
    })
  })

  describe('PATCH /api/caldav/events/:id', () => {
    test('returns 500 when not connected', async () => {
      const { patch } = createTestApp()
      const res = await patch('/api/caldav/events/nonexistent-id', {
        summary: 'Updated',
      })
      const body = await res.json()

      // ensureConnected() throws before event lookup since DAV client is null
      expect(res.status).toBe(500)
      expect(body.error).toContain('not connected')
    })
  })

  describe('DELETE /api/caldav/events/:id', () => {
    test('returns 500 when not connected', async () => {
      const { app } = createTestApp()
      const res = await app.request('http://localhost/api/caldav/events/nonexistent-id', {
        method: 'DELETE',
      })
      const body = await res.json()

      // ensureConnected() throws before event lookup since DAV client is null
      expect(res.status).toBe(500)
      expect(body.error).toContain('not connected')
    })
  })

  describe('POST /api/caldav/enable', () => {
    test('returns success', async () => {
      const { post } = createTestApp()
      const res = await post('/api/caldav/enable')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
    })
  })

  describe('POST /api/caldav/disable', () => {
    test('returns success', async () => {
      const { post } = createTestApp()
      const res = await post('/api/caldav/disable')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
    })
  })
})
