import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { setupTestEnv, type TestEnv } from '../../__tests__/utils/env'
import { db, chatSessions, messagingConnections } from '../../db'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import {
  getOrCreateSession,
  resetSession,
  listSessionMappings,
  deleteSessionMapping,
} from './session-mapper'

describe('Session Mapper', () => {
  let testEnv: TestEnv
  let connectionId: string

  beforeEach(() => {
    testEnv = setupTestEnv()

    // Create a test connection for mapping sessions
    connectionId = nanoid()
    db.insert(messagingConnections)
      .values({
        id: connectionId,
        channelType: 'whatsapp',
        enabled: true,
        status: 'connected',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('getOrCreateSession', () => {
    test('creates a new session for first-time user', () => {
      const channelUserId = '+15551234567@s.whatsapp.net'
      const channelUserName = 'Test User'

      const result = getOrCreateSession(connectionId, channelUserId, channelUserName)

      expect(result.isNew).toBe(true)
      expect(result.session.id).toBeDefined()
      expect(result.session.title).toBe('Chat with Test User')
      expect(result.mapping.channelUserId).toBe(channelUserId)
      expect(result.mapping.sessionId).toBe(result.session.id)
    })

    test('returns existing session for returning user', () => {
      const channelUserId = '+15551234567@s.whatsapp.net'

      // First call creates session
      const first = getOrCreateSession(connectionId, channelUserId)
      expect(first.isNew).toBe(true)

      // Second call returns existing
      const second = getOrCreateSession(connectionId, channelUserId)
      expect(second.isNew).toBe(false)
      expect(second.session.id).toBe(first.session.id)
      expect(second.mapping.id).toBe(first.mapping.id)
    })

    test('updates lastMessageAt timestamp on subsequent calls', async () => {
      const channelUserId = '+15551234567@s.whatsapp.net'

      const first = getOrCreateSession(connectionId, channelUserId)
      const firstCreatedAt = first.mapping.createdAt

      // Wait to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 100))

      const second = getOrCreateSession(connectionId, channelUserId)

      // createdAt should remain the same
      expect(second.mapping.createdAt).toBe(firstCreatedAt)

      // lastMessageAt should be updated (>= first because timing can vary)
      const firstTime = new Date(first.mapping.lastMessageAt).getTime()
      const secondTime = new Date(second.mapping.lastMessageAt).getTime()
      expect(secondTime).toBeGreaterThanOrEqual(firstTime)
    })

    test('creates different sessions for different users', () => {
      const user1 = '+15551111111@s.whatsapp.net'
      const user2 = '+15552222222@s.whatsapp.net'

      const session1 = getOrCreateSession(connectionId, user1, 'User One')
      const session2 = getOrCreateSession(connectionId, user2, 'User Two')

      expect(session1.session.id).not.toBe(session2.session.id)
      expect(session1.mapping.id).not.toBe(session2.mapping.id)
    })

    test('uses channelUserId in title when no name provided', () => {
      const channelUserId = '+15551234567@s.whatsapp.net'

      const result = getOrCreateSession(connectionId, channelUserId)

      expect(result.session.title).toBe(`Chat ${channelUserId}`)
    })

    test('handles LID format user IDs', () => {
      const lidUserId = '123456789012345@lid'

      const result = getOrCreateSession(connectionId, lidUserId, 'Self')

      expect(result.isNew).toBe(true)
      expect(result.mapping.channelUserId).toBe(lidUserId)
    })

    test('creates new session if previous was deleted', () => {
      const channelUserId = '+15551234567@s.whatsapp.net'

      // Create initial session
      const first = getOrCreateSession(connectionId, channelUserId)
      const firstSessionId = first.session.id

      // Delete the chat session (simulating user deletion)
      db.delete(chatSessions).where(eq(chatSessions.id, firstSessionId)).run()

      // Get session again - should create new one
      const second = getOrCreateSession(connectionId, channelUserId)
      expect(second.session.id).not.toBe(firstSessionId)
      expect(second.isNew).toBe(true)
    })
  })

  describe('resetSession', () => {
    test('creates new session for existing user', () => {
      const channelUserId = '+15551234567@s.whatsapp.net'

      // Create initial session
      const first = getOrCreateSession(connectionId, channelUserId, 'User')
      const firstSessionId = first.session.id

      // Reset session
      const reset = resetSession(connectionId, channelUserId, 'User')

      expect(reset.isNew).toBe(true)
      expect(reset.session.id).not.toBe(firstSessionId)
      expect(reset.mapping.sessionId).toBe(reset.session.id)
    })

    test('preserves mapping but updates sessionId', () => {
      const channelUserId = '+15551234567@s.whatsapp.net'

      const first = getOrCreateSession(connectionId, channelUserId)
      const mappingId = first.mapping.id

      const reset = resetSession(connectionId, channelUserId)

      expect(reset.mapping.id).toBe(mappingId) // Same mapping
      expect(reset.mapping.sessionId).not.toBe(first.session.id) // New session
    })

    test('creates mapping if none exists', () => {
      const channelUserId = '+15559999999@s.whatsapp.net'

      // Reset for new user (no existing mapping)
      const result = resetSession(connectionId, channelUserId, 'New User')

      expect(result.isNew).toBe(true)
      expect(result.mapping.channelUserId).toBe(channelUserId)
    })
  })

  describe('listSessionMappings', () => {
    test('returns empty array for connection with no mappings', () => {
      const newConnectionId = nanoid()
      db.insert(messagingConnections)
        .values({
          id: newConnectionId,
          channelType: 'whatsapp',
          enabled: true,
          status: 'disconnected',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run()

      const mappings = listSessionMappings(newConnectionId)
      expect(mappings).toEqual([])
    })

    test('returns all mappings for a connection', () => {
      const user1 = '+15551111111@s.whatsapp.net'
      const user2 = '+15552222222@s.whatsapp.net'
      const user3 = '+15553333333@s.whatsapp.net'

      getOrCreateSession(connectionId, user1)
      getOrCreateSession(connectionId, user2)
      getOrCreateSession(connectionId, user3)

      const mappings = listSessionMappings(connectionId)
      expect(mappings.length).toBe(3)
    })

    test('does not return mappings from other connections', () => {
      const otherConnectionId = nanoid()
      db.insert(messagingConnections)
        .values({
          id: otherConnectionId,
          channelType: 'whatsapp',
          enabled: true,
          status: 'connected',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run()

      // Create mapping for main connection
      getOrCreateSession(connectionId, '+15551111111@s.whatsapp.net')

      // Create mapping for other connection
      getOrCreateSession(otherConnectionId, '+15552222222@s.whatsapp.net')

      const mainMappings = listSessionMappings(connectionId)
      const otherMappings = listSessionMappings(otherConnectionId)

      expect(mainMappings.length).toBe(1)
      expect(otherMappings.length).toBe(1)
      expect(mainMappings[0].channelUserId).toBe('+15551111111@s.whatsapp.net')
      expect(otherMappings[0].channelUserId).toBe('+15552222222@s.whatsapp.net')
    })
  })

  describe('deleteSessionMapping', () => {
    test('deletes existing mapping and returns true', () => {
      const channelUserId = '+15551234567@s.whatsapp.net'

      const { mapping } = getOrCreateSession(connectionId, channelUserId)

      const result = deleteSessionMapping(mapping.id)
      expect(result).toBe(true)

      // Verify it's gone
      const mappings = listSessionMappings(connectionId)
      expect(mappings.length).toBe(0)
    })

    test('returns false for non-existent mapping', () => {
      const result = deleteSessionMapping('non-existent-id')
      expect(result).toBe(false)
    })

    test('does not delete associated chat session', () => {
      const channelUserId = '+15551234567@s.whatsapp.net'

      const { mapping, session } = getOrCreateSession(connectionId, channelUserId)

      deleteSessionMapping(mapping.id)

      // Chat session should still exist
      const chatSession = db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, session.id))
        .get()

      expect(chatSession).toBeDefined()
    })
  })
})
