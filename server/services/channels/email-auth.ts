/**
 * Email authorization utilities.
 * Handles allowlist checking and thread authorization.
 */

import { eq, and } from 'drizzle-orm'
import { db, emailAuthorizedThreads } from '../../db'
import { log } from '../../lib/logger'
import type { EmailHeaders } from './email-types'

/**
 * Result of authorization check.
 */
export interface AuthorizationResult {
  authorized: boolean
  reason?: string
  threadId?: string
  authorizedBy?: string
}

/**
 * Check if an email address matches the allowlist.
 * Supports exact matches and wildcard domains (*@example.com).
 */
export function isAllowedSender(email: string | null, allowedSenders: string[]): boolean {
  if (!email) return false
  const normalizedEmail = email.toLowerCase()

  for (const pattern of allowedSenders) {
    const normalizedPattern = pattern.toLowerCase().trim()

    // Exact match
    if (normalizedEmail === normalizedPattern) {
      return true
    }

    // Wildcard domain match (*@example.com)
    if (normalizedPattern.startsWith('*@')) {
      const domain = normalizedPattern.slice(2)
      if (normalizedEmail.endsWith(`@${domain}`)) {
        return true
      }
    }
  }

  return false
}

/**
 * Check if the email should be processed based on authorization rules.
 * Returns the thread ID if authorized.
 *
 * Authorization model:
 * 1. Allowlisted sender -> always respond
 * 2. CC'd by allowlisted person -> authorize the thread, respond
 * 3. Reply in an authorized thread -> respond (even from non-allowlisted senders)
 * 4. Otherwise -> ignore
 */
export async function checkAuthorization(
  connectionId: string,
  headers: EmailHeaders,
  allowedSenders: string[],
  myEmail: string | undefined
): Promise<AuthorizationResult> {
  // Determine thread ID from email chain
  // Use the root Message-ID from References, or In-Reply-To, or current Message-ID
  const threadId = headers.references[0] || headers.inReplyTo || headers.messageId || null

  // 1. Check if sender is in allowlist
  if (isAllowedSender(headers.from, allowedSenders)) {
    log.messaging.debug('Sender is allowlisted', { from: headers.from })
    return { authorized: true, threadId: threadId || undefined, authorizedBy: headers.from || undefined }
  }

  // 2. Check if this is a reply in an already-authorized thread
  if (threadId) {
    const authorizedThread = db
      .select()
      .from(emailAuthorizedThreads)
      .where(and(
        eq(emailAuthorizedThreads.connectionId, connectionId),
        eq(emailAuthorizedThreads.threadId, threadId)
      ))
      .get()

    if (authorizedThread) {
      log.messaging.debug('Thread is already authorized', {
        threadId,
        authorizedBy: authorizedThread.authorizedBy
      })
      return {
        authorized: true,
        threadId,
        authorizedBy: authorizedThread.authorizedBy
      }
    }
  }

  // 3. Check if an allowlisted sender CC'd us into this thread
  // This happens when: we're in To or CC, and an allowlisted sender is in From/To/CC
  const weAreRecipient = myEmail && (headers.to.includes(myEmail) || headers.cc.includes(myEmail))

  if (weAreRecipient) {
    // Check if any allowlisted sender is in the conversation
    const allParticipants = [headers.from, ...headers.to, ...headers.cc].filter(Boolean) as string[]
    const allowlistedParticipant = allParticipants.find(addr =>
      isAllowedSender(addr, allowedSenders) && addr !== myEmail
    )

    if (allowlistedParticipant) {
      // Authorize this thread for future messages
      const newThreadId = threadId || headers.messageId || `thread-${Date.now()}`

      db.insert(emailAuthorizedThreads).values({
        id: crypto.randomUUID(),
        connectionId,
        threadId: newThreadId,
        authorizedBy: allowlistedParticipant,
        subject: headers.subject || null,
        createdAt: new Date().toISOString(),
      }).run()

      log.messaging.info('Thread authorized by CC from allowlisted sender', {
        connectionId,
        threadId: newThreadId,
        authorizedBy: allowlistedParticipant,
        subject: headers.subject,
      })

      return {
        authorized: true,
        threadId: newThreadId,
        authorizedBy: allowlistedParticipant
      }
    }
  }

  // Not authorized
  return {
    authorized: false,
    reason: allowedSenders.length === 0
      ? 'No allowed senders configured'
      : 'Sender not in allowlist and thread not authorized'
  }
}
