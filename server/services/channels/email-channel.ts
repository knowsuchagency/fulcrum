/**
 * Email channel implementation using nodemailer (SMTP) and imapflow (IMAP).
 * Handles sending via SMTP and receiving via IMAP polling.
 *
 * Authorization model:
 * 1. Allowlisted sender -> always respond
 * 2. CC'd by allowlisted person -> authorize the thread, respond
 * 3. Reply in an authorized thread -> respond (even from non-allowlisted senders)
 * 4. Otherwise -> ignore
 */

import { createTransport, type Transporter } from 'nodemailer'
import { ImapFlow } from 'imapflow'
import { eq } from 'drizzle-orm'
import { db, emails } from '../../db'
import { log } from '../../lib/logger'
import { getSettings } from '../../lib/settings'
import type {
  MessagingChannel,
  ChannelEvents,
  ConnectionStatus,
  IncomingMessage,
  EmailAuthState,
} from './types'

// Import from new modules
import { parseEmailHeaders, parseEmailContent } from './email-parser'
import { checkAuthorization } from './email-auth'
import { storeEmail, getStoredEmails as getStoredEmailsFromDb } from './email-storage'
import { sendEmail, sendUnauthorizedResponse } from './email-sender'
import { isAutomatedEmail } from './email-types'

export class EmailChannel implements MessagingChannel {
  readonly type = 'email' as const
  readonly connectionId: string

  private transporter: Transporter | null = null
  private imapClient: ImapFlow | null = null
  private events: ChannelEvents | null = null
  private status: ConnectionStatus = 'disconnected'
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private isShuttingDown = false
  private credentials: EmailAuthState | null = null
  private lastSeenUid: number = 0

  constructor(connectionId: string, credentials?: EmailAuthState) {
    this.connectionId = connectionId
    this.credentials = credentials ?? null
  }

  /** Create an ImapFlow client with an error event listener to prevent unhandled crashes */
  private createImapClient(): ImapFlow {
    if (!this.credentials) throw new Error('No credentials available')
    const client = new ImapFlow({
      host: this.credentials.imap.host,
      port: this.credentials.imap.port,
      secure: this.credentials.imap.secure,
      auth: {
        user: this.credentials.imap.user,
        pass: this.credentials.imap.password,
      },
      logger: false,
    })
    client.on('error', (err: Error) => {
      log.messaging.error('IMAP client error', {
        connectionId: this.connectionId,
        error: String(err),
      })
    })
    return client
  }

  async initialize(events: ChannelEvents): Promise<void> {
    this.events = events
    this.isShuttingDown = false

    if (!this.credentials) {
      // Load credentials from settings
      const settings = getSettings()
      const emailConfig = settings.channels.email

      if (!emailConfig.smtp.host || !emailConfig.smtp.user || !emailConfig.smtp.password ||
          !emailConfig.imap.host || !emailConfig.imap.user || !emailConfig.imap.password) {
        this.updateStatus('credentials_required')
        return
      }

      this.credentials = {
        smtp: emailConfig.smtp,
        imap: emailConfig.imap,
        pollIntervalSeconds: emailConfig.pollIntervalSeconds,
        sendAs: emailConfig.sendAs || undefined,
        allowedSenders: emailConfig.allowedSenders,
        bcc: emailConfig.bcc || undefined,
      }
    }

    await this.connect()
  }

  private async connect(): Promise<void> {
    if (this.isShuttingDown || !this.credentials) return

    try {
      this.updateStatus('connecting')

      // Setup SMTP transport
      this.transporter = createTransport({
        host: this.credentials.smtp.host,
        port: this.credentials.smtp.port,
        secure: this.credentials.smtp.secure,
        auth: {
          user: this.credentials.smtp.user,
          pass: this.credentials.smtp.password,
        },
      })

      // Verify SMTP connection
      await this.transporter.verify()

      log.messaging.info('SMTP connection verified', {
        connectionId: this.connectionId,
        host: this.credentials.smtp.host,
      })

      // Setup IMAP client
      this.imapClient = this.createImapClient()

      // Connect to IMAP
      await this.imapClient.connect()

      log.messaging.info('IMAP connection established', {
        connectionId: this.connectionId,
        host: this.credentials.imap.host,
      })

      // Get the last UID from INBOX to avoid processing old emails
      await this.imapClient.mailboxOpen('INBOX')
      const status = await this.imapClient.status('INBOX', { uidNext: true })
      this.lastSeenUid = (status.uidNext ?? 1) - 1
      await this.imapClient.logout()

      this.updateStatus('connected')

      // Start IMAP polling
      this.startPolling()
    } catch (err) {
      log.messaging.error('Email connect error', {
        connectionId: this.connectionId,
        error: String(err),
      })
      this.updateStatus('disconnected')
    }
  }

  private startPolling(): void {
    if (this.pollTimer || !this.credentials) return

    const intervalMs = (this.credentials.pollIntervalSeconds || 30) * 1000

    log.messaging.info('Starting IMAP polling', {
      connectionId: this.connectionId,
      intervalMs,
    })

    // Initial poll
    this.pollForNewEmails()

    // Schedule regular polling
    this.pollTimer = setInterval(() => {
      this.pollForNewEmails()
    }, intervalMs)
  }

  private async pollForNewEmails(): Promise<void> {
    if (this.isShuttingDown || !this.credentials) return

    try {
      // Create new IMAP connection for polling
      const client = this.createImapClient()

      await client.connect()
      const lock = await client.getMailboxLock('INBOX')

      try {
        // Search for unseen emails with UID greater than last seen
        const searchQuery = this.lastSeenUid > 0
          ? { uid: `${this.lastSeenUid + 1}:*`, seen: false }
          : { seen: false }

        for await (const message of client.fetch(searchQuery, {
          uid: true,
          envelope: true,
          source: true,
        })) {
          // Skip if we've already processed this UID
          if (message.uid <= this.lastSeenUid) continue

          this.lastSeenUid = Math.max(this.lastSeenUid, message.uid)

          // Parse full headers from source
          const headers = parseEmailHeaders(message.source, message.envelope)

          if (!headers.from) continue

          // Skip emails from ourselves (to avoid loops)
          const fromAddress = this.getFromAddress().toLowerCase()
          if (headers.from.toLowerCase() === fromAddress) {
            continue
          }

          // Check authorization
          const authResult = await checkAuthorization(
            this.connectionId,
            headers,
            this.credentials?.allowedSenders || [],
            this.credentials?.smtp.user.toLowerCase()
          )

          if (!authResult.authorized) {
            // Check if this is an automated email before sending a response
            const automatedCheck = isAutomatedEmail(headers)

            if (automatedCheck.isAutomated) {
              log.messaging.info('Email skipped - automated sender', {
                connectionId: this.connectionId,
                from: headers.from,
                subject: headers.subject,
                reason: automatedCheck.reason,
              })
            } else {
              log.messaging.info('Email rejected - not authorized', {
                connectionId: this.connectionId,
                from: headers.from,
                subject: headers.subject,
                reason: authResult.reason,
              })

              // Send canned response to unauthorized human sender
              if (this.transporter) {
                await sendUnauthorizedResponse(
                  this.transporter,
                  this.connectionId,
                  this.getFromAddress(),
                  headers,
                  this.credentials?.bcc
                )
              }
            }

            // Mark as read to avoid reprocessing
            await client.messageFlagsAdd({ uid: message.uid }, ['\\Seen'])
            continue
          }

          // Parse email content
          const content = await parseEmailContent(message.source, this.connectionId)
          if (!content) continue

          const incomingMessage: IncomingMessage = {
            channelType: 'email',
            connectionId: this.connectionId,
            senderId: headers.from,
            senderName: headers.fromName || undefined,
            content,
            timestamp: headers.date || new Date(),
            // Include thread info for reply threading
            metadata: {
              messageId: headers.messageId,
              inReplyTo: headers.inReplyTo,
              references: headers.references,
              subject: headers.subject,
              threadId: authResult.threadId,
            },
          }

          log.messaging.info('Email received', {
            connectionId: this.connectionId,
            from: headers.from,
            subject: headers.subject,
            contentLength: content.length,
            threadId: authResult.threadId,
            authorizedBy: authResult.authorizedBy,
          })

          // Store the incoming email locally
          if (headers.messageId) {
            storeEmail({
              connectionId: this.connectionId,
              messageId: headers.messageId,
              threadId: authResult.threadId,
              inReplyTo: headers.inReplyTo ?? undefined,
              references: headers.references.length > 0 ? headers.references : undefined,
              direction: 'incoming',
              fromAddress: headers.from || 'unknown',
              fromName: headers.fromName ?? undefined,
              toAddresses: headers.to.length > 0 ? headers.to : undefined,
              ccAddresses: headers.cc.length > 0 ? headers.cc : undefined,
              subject: headers.subject ?? undefined,
              textContent: content,
              emailDate: headers.date ?? undefined,
              imapUid: message.uid,
            })
          }

          // Process message
          try {
            await this.events?.onMessage(incomingMessage)
          } catch (err) {
            log.messaging.error('Error processing email message', {
              connectionId: this.connectionId,
              error: String(err),
            })
          }

          // Note: We don't mark messages as read here because imapflow's
          // messageFlagsAdd hangs when called inside the fetch loop.
          // Messages will be skipped on subsequent polls via UID tracking.
        }
      } finally {
        lock.release()
      }

      await client.logout()
    } catch (err) {
      log.messaging.error('IMAP poll error', {
        connectionId: this.connectionId,
        error: String(err),
      })

      // Don't change status for transient errors, but log them
      if (String(err).includes('AUTHENTICATIONFAILED') || String(err).includes('LOGIN')) {
        this.updateStatus('credentials_required')
      }
    }
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true

    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }

    if (this.imapClient) {
      try {
        await this.imapClient.logout()
      } catch {
        // Ignore logout errors
      }
      this.imapClient = null
    }

    if (this.transporter) {
      this.transporter.close()
      this.transporter = null
    }

    this.updateStatus('disconnected')
    log.messaging.info('Email channel shutdown', {
      connectionId: this.connectionId,
    })
  }

  async sendMessage(recipientId: string, content: string, metadata?: Record<string, unknown>): Promise<boolean> {
    if (!this.transporter || !this.credentials) {
      log.messaging.warn('Cannot send email - not connected', {
        connectionId: this.connectionId,
        status: this.status,
      })
      return false
    }

    return sendEmail(
      this.transporter,
      this.connectionId,
      this.getFromAddress(),
      recipientId,
      content,
      metadata,
      this.credentials?.bcc
    )
  }

  /**
   * Get the email address to use in the From header.
   * Uses sendAs if configured (e.g., for AWS SES where SMTP user is an access key),
   * otherwise falls back to the SMTP user.
   */
  private getFromAddress(): string {
    if (!this.credentials) {
      throw new Error('Not connected - no credentials available')
    }
    return this.credentials.sendAs || this.credentials.smtp.user
  }

  getStatus(): ConnectionStatus {
    return this.status
  }

  private updateStatus(status: ConnectionStatus): void {
    this.status = status

    // Notify listeners (no database update - email config is in settings.json)
    this.events?.onConnectionChange(status)
  }

  /**
   * Search emails via IMAP.
   * Returns matching email UIDs that can then be fetched.
   */
  async searchImapEmails(criteria: {
    subject?: string
    from?: string
    to?: string
    since?: Date
    before?: Date
    text?: string
    seen?: boolean
    flagged?: boolean
  }): Promise<number[]> {
    if (!this.credentials) {
      throw new Error('Not connected - no credentials available')
    }

    const client = this.createImapClient()

    try {
      await client.connect()
      const lock = await client.getMailboxLock('INBOX')

      try {
        // Build IMAP search query
        const searchQuery: Record<string, unknown> = {}

        if (criteria.subject) searchQuery.subject = criteria.subject
        if (criteria.from) searchQuery.from = criteria.from
        if (criteria.to) searchQuery.to = criteria.to
        if (criteria.since) searchQuery.since = criteria.since
        if (criteria.before) searchQuery.before = criteria.before
        if (criteria.text) searchQuery.body = criteria.text
        if (criteria.seen !== undefined) {
          searchQuery.seen = criteria.seen
        }
        if (criteria.flagged !== undefined) {
          searchQuery.flagged = criteria.flagged
        }

        const uids = await client.search(searchQuery, { uid: true })
        return uids as number[]
      } finally {
        lock.release()
      }
    } finally {
      await client.logout()
    }
  }

  /**
   * Fetch emails by UID from IMAP and store them locally.
   * Returns the stored email records.
   */
  async fetchAndStoreEmails(uids: number[], options?: { limit?: number }): Promise<typeof emails.$inferSelect[]> {
    if (!this.credentials || uids.length === 0) {
      return []
    }

    const limit = options?.limit ?? 50
    const uidsToFetch = uids.slice(0, limit)

    const client = this.createImapClient()

    const storedEmails: typeof emails.$inferSelect[] = []

    try {
      await client.connect()
      const lock = await client.getMailboxLock('INBOX')

      try {
        for await (const message of client.fetch(uidsToFetch, {
          uid: true,
          source: true,
          envelope: true,
        })) {
          const headers = parseEmailHeaders(message.source, message.envelope)

          if (!headers.messageId) continue

          // Parse content
          const content = await parseEmailContent(message.source, this.connectionId)

          // Store the email
          storeEmail({
            connectionId: this.connectionId,
            messageId: headers.messageId,
            threadId: headers.references[0] || headers.inReplyTo || headers.messageId,
            inReplyTo: headers.inReplyTo ?? undefined,
            references: headers.references.length > 0 ? headers.references : undefined,
            direction: 'incoming',
            fromAddress: headers.from || 'unknown',
            fromName: headers.fromName ?? undefined,
            toAddresses: headers.to.length > 0 ? headers.to : undefined,
            ccAddresses: headers.cc.length > 0 ? headers.cc : undefined,
            subject: headers.subject ?? undefined,
            textContent: content ?? undefined,
            emailDate: headers.date ?? undefined,
            imapUid: message.uid,
          })

          // Retrieve the stored email
          const stored = db
            .select()
            .from(emails)
            .where(eq(emails.messageId, headers.messageId))
            .get()

          if (stored) {
            storedEmails.push(stored)
          }
        }
      } finally {
        lock.release()
      }
    } finally {
      await client.logout()
    }

    return storedEmails
  }

  /**
   * Get locally stored emails with optional filters.
   */
  getStoredEmails(options?: {
    limit?: number
    offset?: number
    direction?: 'incoming' | 'outgoing'
    threadId?: string
    search?: string
    folder?: string
  }): typeof emails.$inferSelect[] {
    return getStoredEmailsFromDb({
      connectionId: this.connectionId,
      ...options,
    })
  }
}

/**
 * Test email credentials without saving them.
 * Returns true if both SMTP and IMAP connections succeed.
 */
export async function testEmailCredentials(credentials: EmailAuthState): Promise<{
  success: boolean
  smtpOk: boolean
  imapOk: boolean
  error?: string
}> {
  // Test SMTP
  try {
    const transporter = createTransport({
      host: credentials.smtp.host,
      port: credentials.smtp.port,
      secure: credentials.smtp.secure,
      auth: {
        user: credentials.smtp.user,
        pass: credentials.smtp.password,
      },
    })

    await transporter.verify()
    transporter.close()
  } catch (err) {
    return {
      success: false,
      smtpOk: false,
      imapOk: false,
      error: `SMTP error: ${String(err)}`,
    }
  }

  // Test IMAP
  try {
    const client = new ImapFlow({
      host: credentials.imap.host,
      port: credentials.imap.port,
      secure: credentials.imap.secure,
      auth: {
        user: credentials.imap.user,
        pass: credentials.imap.password,
      },
      logger: false,
    })
    client.on('error', () => {}) // Prevent unhandled error event crash

    await client.connect()
    await client.logout()
  } catch (err) {
    return {
      success: false,
      smtpOk: true,
      imapOk: false,
      error: `IMAP error: ${String(err)}`,
    }
  }

  return {
    success: true,
    smtpOk: true,
    imapOk: true,
  }
}
