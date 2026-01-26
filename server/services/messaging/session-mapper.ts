/**
 * Session Mapper - Maps messaging channel users to AI chat sessions.
 * Each phone number/user ID gets a persistent conversation with the AI.
 */

import { nanoid } from 'nanoid'
import { eq, and } from 'drizzle-orm'
import { db, messagingSessionMappings, chatSessions } from '../../db'
import type { MessagingSessionMapping, ChatSession } from '../../db/schema'
import { log } from '../../lib/logger'

export interface SessionMapperResult {
  mapping: MessagingSessionMapping
  session: ChatSession
  isNew: boolean
}

/**
 * Get or create a chat session for a channel user.
 * Each user gets one persistent session per connection.
 */
export function getOrCreateSession(
  connectionId: string,
  channelUserId: string,
  channelUserName?: string
): SessionMapperResult {
  const now = new Date().toISOString()

  // Check for existing mapping
  const existingMapping = db
    .select()
    .from(messagingSessionMappings)
    .where(
      and(
        eq(messagingSessionMappings.connectionId, connectionId),
        eq(messagingSessionMappings.channelUserId, channelUserId)
      )
    )
    .get()

  if (existingMapping) {
    // Update last message timestamp
    db.update(messagingSessionMappings)
      .set({ lastMessageAt: now })
      .where(eq(messagingSessionMappings.id, existingMapping.id))
      .run()

    // Get the associated session
    const session = db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, existingMapping.sessionId))
      .get()

    if (session) {
      log.messaging.debug('Found existing session mapping', {
        connectionId,
        channelUserId,
        sessionId: session.id,
      })
      return { mapping: existingMapping, session, isNew: false }
    }

    // Session was deleted - need to create a new one
    log.messaging.warn('Session mapping exists but session was deleted', {
      mappingId: existingMapping.id,
      sessionId: existingMapping.sessionId,
    })
  }

  // Create new chat session
  const sessionId = nanoid()
  const sessionTitle = channelUserName
    ? `Chat with ${channelUserName}`
    : `WhatsApp ${channelUserId}`

  const newSession = {
    id: sessionId,
    title: sessionTitle,
    provider: 'claude' as const,
    model: 'sonnet',
    isFavorite: false,
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  }

  db.insert(chatSessions).values(newSession).run()

  // Create or update the mapping
  const mappingId = existingMapping?.id ?? nanoid()
  const newMapping = {
    id: mappingId,
    connectionId,
    channelUserId,
    channelUserName: channelUserName ?? null,
    sessionId,
    createdAt: existingMapping?.createdAt ?? now,
    lastMessageAt: now,
  }

  if (existingMapping) {
    db.update(messagingSessionMappings)
      .set({
        sessionId,
        channelUserName: channelUserName ?? null,
        lastMessageAt: now,
      })
      .where(eq(messagingSessionMappings.id, existingMapping.id))
      .run()
  } else {
    db.insert(messagingSessionMappings).values(newMapping).run()
  }

  const session = db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, sessionId))
    .get()!

  const mapping = db
    .select()
    .from(messagingSessionMappings)
    .where(eq(messagingSessionMappings.id, mappingId))
    .get()!

  log.messaging.info('Created new session for channel user', {
    connectionId,
    channelUserId,
    sessionId,
  })

  return { mapping, session, isNew: true }
}

/**
 * Reset a user's session - creates a fresh conversation.
 */
export function resetSession(
  connectionId: string,
  channelUserId: string,
  channelUserName?: string
): SessionMapperResult {
  const now = new Date().toISOString()

  // Find existing mapping
  const existingMapping = db
    .select()
    .from(messagingSessionMappings)
    .where(
      and(
        eq(messagingSessionMappings.connectionId, connectionId),
        eq(messagingSessionMappings.channelUserId, channelUserId)
      )
    )
    .get()

  // Create new chat session
  const sessionId = nanoid()
  const sessionTitle = channelUserName
    ? `Chat with ${channelUserName}`
    : `WhatsApp ${channelUserId}`

  const newSession = {
    id: sessionId,
    title: sessionTitle,
    provider: 'claude' as const,
    model: 'sonnet',
    isFavorite: false,
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  }

  db.insert(chatSessions).values(newSession).run()

  // Update or create mapping
  const mappingId = existingMapping?.id ?? nanoid()

  if (existingMapping) {
    db.update(messagingSessionMappings)
      .set({
        sessionId,
        channelUserName: channelUserName ?? null,
        lastMessageAt: now,
      })
      .where(eq(messagingSessionMappings.id, existingMapping.id))
      .run()
  } else {
    db.insert(messagingSessionMappings)
      .values({
        id: mappingId,
        connectionId,
        channelUserId,
        channelUserName: channelUserName ?? null,
        sessionId,
        createdAt: now,
        lastMessageAt: now,
      })
      .run()
  }

  const session = db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, sessionId))
    .get()!

  const mapping = db
    .select()
    .from(messagingSessionMappings)
    .where(eq(messagingSessionMappings.id, mappingId))
    .get()!

  log.messaging.info('Reset session for channel user', {
    connectionId,
    channelUserId,
    newSessionId: sessionId,
  })

  return { mapping, session, isNew: true }
}

/**
 * List all session mappings for a connection.
 */
export function listSessionMappings(connectionId: string): MessagingSessionMapping[] {
  return db
    .select()
    .from(messagingSessionMappings)
    .where(eq(messagingSessionMappings.connectionId, connectionId))
    .all()
}

/**
 * Delete a session mapping (does not delete the chat session).
 */
export function deleteSessionMapping(mappingId: string): boolean {
  const result = db
    .delete(messagingSessionMappings)
    .where(eq(messagingSessionMappings.id, mappingId))
    .run()
  return result.changes > 0
}
