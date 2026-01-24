import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { createTestApp } from '../__tests__/fixtures/app'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'

// Mock the Claude Agent SDK to avoid real API calls
mock.module('@anthropic-ai/claude-agent-sdk', () => ({
  query: function* () {
    yield { type: 'assistant', session_id: 'mock-session-123', message: { content: [{ type: 'text', text: 'Hello!' }] } }
    yield { type: 'result', session_id: 'mock-session-123', total_cost_usd: 0.01 }
  },
}))

describe('Chat Routes', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('POST /api/chat/sessions', () => {
    test('creates a new session', async () => {
      const { post } = createTestApp()
      const res = await post('/api/chat/sessions', {})
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.sessionId).toBeDefined()
      expect(typeof body.sessionId).toBe('string')
      // UUID format: 8-4-4-4-12 hex chars
      expect(body.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })

    test('creates a session ignoring extra body fields', async () => {
      const { post, get } = createTestApp()
      // The session endpoint no longer uses taskId - context is passed with each message
      const createRes = await post('/api/chat/sessions', { someField: 'value' })
      const createBody = await createRes.json()

      expect(createRes.status).toBe(200)
      expect(createBody.sessionId).toBeDefined()

      // Verify session was created
      const infoRes = await get(`/api/chat/${createBody.sessionId}`)
      const infoBody = await infoRes.json()

      expect(infoBody.id).toBe(createBody.sessionId)
      expect(infoBody.hasConversation).toBe(false)
    })

    test('handles missing body gracefully', async () => {
      const { request } = createTestApp()
      const res = await request('/api/chat/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.sessionId).toBeDefined()
    })
  })

  describe('GET /api/chat/:sessionId', () => {
    test('returns session info for valid session', async () => {
      const { post, get } = createTestApp()

      // Create a session first
      const createRes = await post('/api/chat/sessions', {})
      const { sessionId } = await createRes.json()

      // Get session info
      const res = await get(`/api/chat/${sessionId}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.id).toBe(sessionId)
      expect(body.hasConversation).toBe(false)
    })

    test('returns 404 for non-existent session', async () => {
      const { get } = createTestApp()
      const res = await get('/api/chat/non-existent-session')
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toBe('Session not found')
    })
  })

  describe('DELETE /api/chat/:sessionId', () => {
    test('deletes an existing session', async () => {
      const { post, request, get } = createTestApp()

      // Create a session
      const createRes = await post('/api/chat/sessions', {})
      const { sessionId } = await createRes.json()

      // Delete it
      const deleteRes = await request(`/api/chat/${sessionId}`, { method: 'DELETE' })
      const deleteBody = await deleteRes.json()

      expect(deleteRes.status).toBe(200)
      expect(deleteBody.success).toBe(true)

      // Verify it's gone
      const getRes = await get(`/api/chat/${sessionId}`)
      expect(getRes.status).toBe(404)
    })

    test('returns 404 for non-existent session', async () => {
      const { request } = createTestApp()
      const res = await request('/api/chat/non-existent-session', { method: 'DELETE' })
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toBe('Session not found')
    })
  })

  describe('POST /api/chat/:sessionId/messages', () => {
    test('returns 400 when message is missing', async () => {
      const { post } = createTestApp()

      // Create a session
      const createRes = await post('/api/chat/sessions', {})
      const { sessionId } = await createRes.json()

      // Try to send without message
      const res = await post(`/api/chat/${sessionId}/messages`, {})
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('Message is required')
    })

    test('returns 400 when message is not a string', async () => {
      const { post } = createTestApp()

      // Create a session
      const createRes = await post('/api/chat/sessions', {})
      const { sessionId } = await createRes.json()

      // Try to send with non-string message
      const res = await post(`/api/chat/${sessionId}/messages`, { message: 123 })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('Message is required')
    })

    test('returns 404 for non-existent session', async () => {
      const { post } = createTestApp()
      const res = await post('/api/chat/non-existent-session/messages', { message: 'Hello' })
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toBe('Session not found')
    })

    test('streams response for valid message', async () => {
      const { post, request } = createTestApp()

      // Create a session
      const createRes = await post('/api/chat/sessions', {})
      const { sessionId } = await createRes.json()

      // Send a message - this should return SSE stream
      const res = await request(`/api/chat/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello, Claude!' }),
      })

      expect(res.status).toBe(200)
      // SSE responses have text/event-stream content type
      expect(res.headers.get('content-type')).toContain('text/event-stream')
    })

    test('accepts model parameter', async () => {
      const { post, request } = createTestApp()

      // Create a session
      const createRes = await post('/api/chat/sessions', {})
      const { sessionId } = await createRes.json()

      // Send a message with model specified
      const res = await request(`/api/chat/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello', model: 'haiku' }),
      })

      expect(res.status).toBe(200)
    })
  })
})
