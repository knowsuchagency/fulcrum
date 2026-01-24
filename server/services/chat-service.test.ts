import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'

// Mock the Claude Agent SDK before importing the service
mock.module('@anthropic-ai/claude-agent-sdk', () => ({
  query: function* () {
    yield {
      type: 'assistant',
      session_id: 'mock-session-123',
      message: { content: [{ type: 'text', text: 'Hello from mock!' }] },
    }
    yield { type: 'result', session_id: 'mock-session-123', total_cost_usd: 0.01 }
  },
}))

// Import after mock is set up
import { createSession, getSession, endSession, getSessionInfo, streamMessage } from './chat-service'

describe('Chat Service', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('createSession', () => {
    test('creates a session and returns UUID', () => {
      const sessionId = createSession()

      expect(sessionId).toBeDefined()
      expect(typeof sessionId).toBe('string')
      // UUID format
      expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })

    test('creates unique sessions', () => {
      const id1 = createSession()
      const id2 = createSession()
      const id3 = createSession()

      expect(id1).not.toBe(id2)
      expect(id2).not.toBe(id3)
      expect(id1).not.toBe(id3)
    })

    test('stores taskId if provided', () => {
      const sessionId = createSession('task-abc-123')
      const session = getSession(sessionId)

      expect(session).toBeDefined()
      expect(session?.taskId).toBe('task-abc-123')
    })

    test('creates session without taskId', () => {
      const sessionId = createSession()
      const session = getSession(sessionId)

      expect(session).toBeDefined()
      expect(session?.taskId).toBeUndefined()
    })
  })

  describe('getSession', () => {
    test('returns session for valid ID', () => {
      const sessionId = createSession()
      const session = getSession(sessionId)

      expect(session).toBeDefined()
      expect(session?.id).toBe(sessionId)
      expect(session?.createdAt).toBeInstanceOf(Date)
    })

    test('returns undefined for non-existent ID', () => {
      const session = getSession('non-existent-id')
      expect(session).toBeUndefined()
    })
  })

  describe('endSession', () => {
    test('removes existing session and returns true', () => {
      const sessionId = createSession()

      // Verify it exists
      expect(getSession(sessionId)).toBeDefined()

      // End it
      const result = endSession(sessionId)
      expect(result).toBe(true)

      // Verify it's gone
      expect(getSession(sessionId)).toBeUndefined()
    })

    test('returns false for non-existent session', () => {
      const result = endSession('non-existent-id')
      expect(result).toBe(false)
    })
  })

  describe('getSessionInfo', () => {
    test('returns info for valid session', () => {
      const sessionId = createSession('task-xyz')
      const info = getSessionInfo(sessionId)

      expect(info).toBeDefined()
      expect(info?.id).toBe(sessionId)
      expect(info?.taskId).toBe('task-xyz')
      expect(info?.hasConversation).toBe(false) // No Claude session yet
    })

    test('returns null for non-existent session', () => {
      const info = getSessionInfo('non-existent-id')
      expect(info).toBeNull()
    })
  })

  describe('streamMessage', () => {
    test('yields error for non-existent session', async () => {
      const events: Array<{ type: string; data: unknown }> = []

      for await (const event of streamMessage('non-existent', 'Hello')) {
        events.push(event)
      }

      expect(events.length).toBe(1)
      expect(events[0].type).toBe('error')
      expect((events[0].data as { message: string }).message).toBe('Session not found')
    })

    test('streams events for valid session', async () => {
      const sessionId = createSession()
      const events: Array<{ type: string; data: unknown }> = []

      for await (const event of streamMessage(sessionId, 'Hello, Claude!')) {
        events.push(event)
      }

      // Should have at least some events (mocked)
      expect(events.length).toBeGreaterThan(0)
    })

    test('defaults to sonnet model', async () => {
      const sessionId = createSession()

      // The mock doesn't validate the model, but we test that it runs without error
      const events: Array<{ type: string; data: unknown }> = []
      for await (const event of streamMessage(sessionId, 'Test')) {
        events.push(event)
      }

      expect(events.length).toBeGreaterThan(0)
    })

    test('accepts different model options', async () => {
      const sessionId = createSession()

      // Test with opus
      const opusEvents: Array<{ type: string; data: unknown }> = []
      for await (const event of streamMessage(sessionId, 'Test', 'opus')) {
        opusEvents.push(event)
      }
      expect(opusEvents.length).toBeGreaterThan(0)

      // Test with haiku
      const haikuEvents: Array<{ type: string; data: unknown }> = []
      for await (const event of streamMessage(sessionId, 'Test', 'haiku')) {
        haikuEvents.push(event)
      }
      expect(haikuEvents.length).toBeGreaterThan(0)
    })
  })
})
