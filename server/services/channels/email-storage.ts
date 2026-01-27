/**
 * Email storage utilities for local database operations.
 */

import { eq, desc, like, or } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db, emails } from '../../db'
import { log } from '../../lib/logger'

/**
 * Parameters for storing an email.
 */
export interface StoreEmailParams {
  connectionId: string
  messageId: string
  threadId?: string
  inReplyTo?: string
  references?: string[]
  direction: 'incoming' | 'outgoing'
  fromAddress: string
  fromName?: string
  toAddresses?: string[]
  ccAddresses?: string[]
  subject?: string
  textContent?: string
  htmlContent?: string
  emailDate?: Date
  imapUid?: number
  folder?: string
}

/**
 * Store an email in the local database.
 */
export function storeEmail(params: StoreEmailParams): void {
  const now = new Date().toISOString()

  // Check if email already exists (by messageId)
  const existing = db
    .select()
    .from(emails)
    .where(eq(emails.messageId, params.messageId))
    .get()

  if (existing) {
    log.messaging.debug('Email already stored', {
      connectionId: params.connectionId,
      messageId: params.messageId,
    })
    return
  }

  // Generate snippet from text content
  const snippet = params.textContent
    ? params.textContent.slice(0, 200).replace(/\s+/g, ' ').trim()
    : undefined

  db.insert(emails)
    .values({
      id: nanoid(),
      connectionId: params.connectionId,
      messageId: params.messageId,
      threadId: params.threadId,
      inReplyTo: params.inReplyTo,
      references: params.references,
      direction: params.direction,
      fromAddress: params.fromAddress,
      fromName: params.fromName,
      toAddresses: params.toAddresses,
      ccAddresses: params.ccAddresses,
      subject: params.subject,
      textContent: params.textContent,
      htmlContent: params.htmlContent,
      snippet,
      emailDate: params.emailDate?.toISOString(),
      folder: params.folder ?? (params.direction === 'outgoing' ? 'sent' : 'inbox'),
      isRead: params.direction === 'outgoing', // Outgoing are automatically "read"
      imapUid: params.imapUid,
      createdAt: now,
    })
    .run()

  log.messaging.debug('Email stored', {
    connectionId: params.connectionId,
    messageId: params.messageId,
    direction: params.direction,
  })
}

/**
 * Options for querying stored emails.
 */
export interface GetStoredEmailsOptions {
  connectionId: string
  limit?: number
  offset?: number
  direction?: 'incoming' | 'outgoing'
  threadId?: string
  search?: string
  folder?: string
}

/**
 * Get locally stored emails with optional filters.
 */
export function getStoredEmails(options: GetStoredEmailsOptions): typeof emails.$inferSelect[] {
  let query = db.select().from(emails).where(eq(emails.connectionId, options.connectionId))

  if (options.direction) {
    query = query.where(eq(emails.direction, options.direction)) as typeof query
  }

  if (options.threadId) {
    query = query.where(eq(emails.threadId, options.threadId)) as typeof query
  }

  if (options.folder) {
    query = query.where(eq(emails.folder, options.folder)) as typeof query
  }

  if (options.search) {
    const searchTerm = `%${options.search}%`
    query = query.where(
      or(
        like(emails.subject, searchTerm),
        like(emails.textContent, searchTerm),
        like(emails.fromAddress, searchTerm)
      )
    ) as typeof query
  }

  const results = query
    .orderBy(desc(emails.createdAt))
    .limit(options.limit ?? 50)
    .offset(options.offset ?? 0)
    .all()

  return results
}
