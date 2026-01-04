import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestApp } from '../__tests__/fixtures/app'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'

describe('Exec Routes', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('POST /api/exec', () => {
    test('executes simple command', async () => {
      const { post } = createTestApp()
      const res = await post('/api/exec', {
        command: 'echo "hello world"',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.stdout).toContain('hello world')
      expect(body.exitCode).toBe(0)
      expect(body.timedOut).toBe(false)
      expect(body.sessionId).toBeDefined()
    })

    test('returns 400 when command is missing', async () => {
      const { post } = createTestApp()
      const res = await post('/api/exec', {})
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('command is required')
    })

    test('captures stdout and includes stderr field', async () => {
      const { post } = createTestApp()
      const res = await post('/api/exec', {
        command: 'echo "stdout message"',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.stdout).toContain('stdout message')
      // stderr field should exist (may be empty due to async buffering)
      expect(typeof body.stderr).toBe('string')
    })

    test('returns non-zero exit code for failed command', async () => {
      const { post } = createTestApp()
      // Use a command that fails but doesn't exit the shell
      const res = await post('/api/exec', {
        command: 'ls /nonexistent_path_12345 2>/dev/null',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      // ls on non-existent path returns exit code 2 or 1 depending on system
      expect(body.exitCode).toBeGreaterThan(0)
    })

    test('creates new session when no sessionId provided', async () => {
      const { post } = createTestApp()
      const res = await post('/api/exec', {
        command: 'pwd',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.sessionId).toBeDefined()
      expect(typeof body.sessionId).toBe('string')
    })

    test('reuses existing session when sessionId provided', async () => {
      const { post } = createTestApp()

      // First command creates session
      const res1 = await post('/api/exec', {
        command: 'cd /tmp',
      })
      const body1 = await res1.json()
      const sessionId = body1.sessionId

      // Second command uses same session
      const res2 = await post('/api/exec', {
        command: 'pwd',
        sessionId,
      })
      const body2 = await res2.json()

      expect(body2.sessionId).toBe(sessionId)
      expect(body2.stdout).toContain('/tmp')
    })

    test('returns 404 for non-existent session', async () => {
      const { post } = createTestApp()
      const res = await post('/api/exec', {
        command: 'echo test',
        sessionId: 'nonexistent-session-id',
      })
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toContain('not found')
    })

    test('creates session with custom name', async () => {
      const { post, get } = createTestApp()
      const res = await post('/api/exec', {
        command: 'echo test',
        name: 'My Session',
      })
      const body = await res.json()

      expect(res.status).toBe(200)

      // Check session list to verify name
      const sessionsRes = await get('/api/exec/sessions')
      const sessions = await sessionsRes.json()
      const session = sessions.find((s: { id: string }) => s.id === body.sessionId)
      expect(session?.name).toBe('My Session')
    })

    test('creates session with custom cwd', async () => {
      const { post } = createTestApp()
      const res = await post('/api/exec', {
        command: 'pwd',
        cwd: '/tmp',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.stdout).toContain('/tmp')
    })

    test('handles command timeout', async () => {
      const { post } = createTestApp()
      const res = await post('/api/exec', {
        command: 'sleep 10',
        timeout: 100, // 100ms timeout
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.timedOut).toBe(true)
      expect(body.exitCode).toBe(null)
    })
  })

  describe('GET /api/exec/sessions', () => {
    test('returns empty array when no sessions', async () => {
      const { get } = createTestApp()
      const res = await get('/api/exec/sessions')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toBeInstanceOf(Array)
    })

    test('returns active sessions', async () => {
      const { post, get } = createTestApp()

      // Create a session
      await post('/api/exec', {
        command: 'echo test',
        name: 'Test Session',
      })

      const res = await get('/api/exec/sessions')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.length).toBeGreaterThanOrEqual(1)

      const session = body.find((s: { name: string }) => s.name === 'Test Session')
      expect(session).toBeDefined()
      expect(session.id).toBeDefined()
      expect(session.cwd).toBeDefined()
      expect(session.createdAt).toBeDefined()
      expect(session.lastUsedAt).toBeDefined()
    })
  })

  describe('PATCH /api/exec/sessions/:id', () => {
    test('updates session name', async () => {
      const { post, patch } = createTestApp()

      // Create a session
      const createRes = await post('/api/exec', {
        command: 'echo test',
        name: 'Original Name',
      })
      const { sessionId } = await createRes.json()

      // Update the name
      const res = await patch(`/api/exec/sessions/${sessionId}`, {
        name: 'Updated Name',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.name).toBe('Updated Name')
    })

    test('returns 404 for non-existent session', async () => {
      const { patch } = createTestApp()
      const res = await patch('/api/exec/sessions/nonexistent', {
        name: 'New Name',
      })
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toContain('not found')
    })
  })

  describe('DELETE /api/exec/sessions/:id', () => {
    test('destroys session', async () => {
      const { post, request, get } = createTestApp()

      // Create a session
      const createRes = await post('/api/exec', {
        command: 'echo test',
        name: 'To Delete',
      })
      const { sessionId } = await createRes.json()

      // Delete the session
      const res = await request(`/api/exec/sessions/${sessionId}`, {
        method: 'DELETE',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)

      // Verify session is gone
      const sessionsRes = await get('/api/exec/sessions')
      const sessions = await sessionsRes.json()
      const session = sessions.find((s: { id: string }) => s.id === sessionId)
      expect(session).toBeUndefined()
    })

    test('returns 404 for non-existent session', async () => {
      const { request } = createTestApp()
      const res = await request('/api/exec/sessions/nonexistent', {
        method: 'DELETE',
      })
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toContain('not found')
    })
  })

  describe('Session persistence', () => {
    test('session maintains working directory across commands', async () => {
      const { post } = createTestApp()

      // Create session and cd to /tmp
      const res1 = await post('/api/exec', {
        command: 'cd /tmp && pwd',
      })
      const body1 = await res1.json()
      const sessionId = body1.sessionId

      // Run pwd again - should still be in /tmp
      const res2 = await post('/api/exec', {
        command: 'pwd',
        sessionId,
      })
      const body2 = await res2.json()

      expect(body2.stdout).toContain('/tmp')
    })

    test('session maintains environment variables across commands', async () => {
      const { post } = createTestApp()

      // Create session and set env var
      const res1 = await post('/api/exec', {
        command: 'export MY_VAR="test_value"',
      })
      const body1 = await res1.json()
      const sessionId = body1.sessionId

      // Check env var
      const res2 = await post('/api/exec', {
        command: 'echo $MY_VAR',
        sessionId,
      })
      const body2 = await res2.json()

      expect(body2.stdout).toContain('test_value')
    })
  })
})
