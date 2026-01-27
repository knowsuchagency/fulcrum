/**
 * Email channel implementation using nodemailer (SMTP) and imapflow (IMAP).
 * Handles sending via SMTP and receiving via IMAP polling.
 *
 * Authorization model:
 * 1. Allowlisted sender → always respond
 * 2. CC'd by allowlisted person → authorize the thread, respond
 * 3. Reply in an authorized thread → respond (even from non-allowlisted senders)
 * 4. Otherwise → ignore
 */

import { createTransport, type Transporter } from 'nodemailer'
import { ImapFlow } from 'imapflow'
import { eq, and } from 'drizzle-orm'
import { db, messagingConnections, emailAuthorizedThreads } from '../../db'
import { log } from '../../lib/logger'
import type {
  MessagingChannel,
  ChannelEvents,
  ConnectionStatus,
  IncomingMessage,
  EmailAuthState,
} from './types'

// Email signature patterns to strip from incoming emails
const SIGNATURE_PATTERNS = [
  /^--\s*$/m, // Standard signature delimiter
  /^_{3,}$/m, // Line of underscores
  /^Sent from my (iPhone|iPad|Android|Galaxy|Pixel)/im,
  /^Get Outlook for/im,
  /^Sent via /im,
]

// Quoted reply patterns to strip
const QUOTED_REPLY_PATTERNS = [
  /^On .+, .+ wrote:$/m, // "On Jan 1, 2024, John wrote:"
  /^>+\s?.*/gm, // Lines starting with >
  /^From: .+$/m, // "From: sender@example.com"
  /^Sent: .+$/m, // "Sent: January 1, 2024"
  /^To: .+$/m, // "To: recipient@example.com"
  /^Subject: .+$/m, // "Subject: Re: ..."
]

/**
 * Parsed email headers for authorization and threading
 */
interface EmailHeaders {
  messageId: string | null
  inReplyTo: string | null
  references: string[]
  from: string | null
  fromName: string | null
  to: string[]
  cc: string[]
  subject: string | null
  date: Date | null
}

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

  async initialize(events: ChannelEvents): Promise<void> {
    this.events = events
    this.isShuttingDown = false

    if (!this.credentials) {
      // Load credentials from database
      const conn = db
        .select()
        .from(messagingConnections)
        .where(eq(messagingConnections.id, this.connectionId))
        .get()

      if (!conn?.authState) {
        this.updateStatus('credentials_required')
        return
      }

      this.credentials = conn.authState as EmailAuthState
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
      this.imapClient = new ImapFlow({
        host: this.credentials.imap.host,
        port: this.credentials.imap.port,
        secure: this.credentials.imap.secure,
        auth: {
          user: this.credentials.imap.user,
          pass: this.credentials.imap.password,
        },
        logger: false, // Disable verbose logging
      })

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
          const headers = this.parseEmailHeaders(message.source, message.envelope)

          if (!headers.from) continue

          // Skip emails from ourselves (to avoid loops)
          if (headers.from.toLowerCase() === this.credentials!.smtp.user.toLowerCase()) {
            continue
          }

          // Check authorization
          const authResult = await this.checkAuthorization(headers)

          if (!authResult.authorized) {
            log.messaging.info('Email rejected - not authorized', {
              connectionId: this.connectionId,
              from: headers.from,
              subject: headers.subject,
              reason: authResult.reason,
            })

            // Send canned response to unauthorized sender
            await this.sendUnauthorizedResponse(headers)

            // Mark as read to avoid reprocessing
            await client.messageFlagsAdd({ uid: message.uid }, ['\\Seen'])
            continue
          }

          // Parse email content
          const content = await this.parseEmailContent(message.source)
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

          // Mark as read
          await client.messageFlagsAdd({ uid: message.uid }, ['\\Seen'])

          // Process message
          try {
            await this.events?.onMessage(incomingMessage)
          } catch (err) {
            log.messaging.error('Error processing email message', {
              connectionId: this.connectionId,
              error: String(err),
            })
          }
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

  /**
   * Parse email headers from raw source
   */
  private parseEmailHeaders(source: Buffer, envelope: { from?: { address?: string; name?: string }[]; subject?: string; date?: string | Date }): EmailHeaders {
    const raw = source.toString('utf-8')
    const headerEnd = raw.indexOf('\r\n\r\n')
    const headerSection = headerEnd > 0 ? raw.slice(0, headerEnd) : raw

    // Helper to extract header value
    const getHeader = (name: string): string | null => {
      const regex = new RegExp(`^${name}:\\s*(.+?)(?=\\r?\\n(?:[^\\s]|$))`, 'im')
      const match = headerSection.match(regex)
      return match ? match[1].replace(/\r?\n\s+/g, ' ').trim() : null
    }

    // Parse addresses from header value
    const parseAddresses = (header: string | null): string[] => {
      if (!header) return []
      const addresses: string[] = []
      // Match email addresses in various formats
      const regex = /<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/g
      let match
      while ((match = regex.exec(header)) !== null) {
        addresses.push(match[1].toLowerCase())
      }
      return addresses
    }

    // Parse References header (space-separated Message-IDs)
    const referencesHeader = getHeader('References')
    const references = referencesHeader
      ? referencesHeader.split(/\s+/).filter(r => r.startsWith('<') || r.includes('@'))
      : []

    return {
      messageId: getHeader('Message-ID'),
      inReplyTo: getHeader('In-Reply-To'),
      references,
      from: envelope?.from?.[0]?.address?.toLowerCase() || parseAddresses(getHeader('From'))[0] || null,
      fromName: envelope?.from?.[0]?.name || null,
      to: parseAddresses(getHeader('To')),
      cc: parseAddresses(getHeader('Cc')),
      subject: envelope?.subject || getHeader('Subject'),
      date: envelope?.date ? new Date(envelope.date) : null,
    }
  }

  /**
   * Check if the email should be processed based on authorization rules.
   * Returns the thread ID if authorized.
   */
  private async checkAuthorization(headers: EmailHeaders): Promise<{
    authorized: boolean
    reason?: string
    threadId?: string
    authorizedBy?: string
  }> {
    const allowedSenders = this.credentials?.allowedSenders || []
    const myEmail = this.credentials?.smtp.user.toLowerCase()

    // Determine thread ID from email chain
    // Use the root Message-ID from References, or In-Reply-To, or current Message-ID
    const threadId = headers.references[0] || headers.inReplyTo || headers.messageId || null

    // 1. Check if sender is in allowlist
    if (this.isAllowedSender(headers.from, allowedSenders)) {
      log.messaging.debug('Sender is allowlisted', { from: headers.from })
      return { authorized: true, threadId: threadId || undefined, authorizedBy: headers.from || undefined }
    }

    // 2. Check if this is a reply in an already-authorized thread
    if (threadId) {
      const authorizedThread = db
        .select()
        .from(emailAuthorizedThreads)
        .where(and(
          eq(emailAuthorizedThreads.connectionId, this.connectionId),
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
    const weAreRecipient = headers.to.includes(myEmail!) || headers.cc.includes(myEmail!)

    if (weAreRecipient) {
      // Check if any allowlisted sender is in the conversation
      const allParticipants = [headers.from, ...headers.to, ...headers.cc].filter(Boolean) as string[]
      const allowlistedParticipant = allParticipants.find(addr =>
        this.isAllowedSender(addr, allowedSenders) && addr !== myEmail
      )

      if (allowlistedParticipant) {
        // Authorize this thread for future messages
        const newThreadId = threadId || headers.messageId || `thread-${Date.now()}`

        db.insert(emailAuthorizedThreads).values({
          id: crypto.randomUUID(),
          connectionId: this.connectionId,
          threadId: newThreadId,
          authorizedBy: allowlistedParticipant,
          subject: headers.subject || null,
          createdAt: new Date().toISOString(),
        }).run()

        log.messaging.info('Thread authorized by CC from allowlisted sender', {
          connectionId: this.connectionId,
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

  /**
   * Check if an email address matches the allowlist.
   * Supports exact matches and wildcard domains (*@example.com).
   */
  private isAllowedSender(email: string | null, allowedSenders: string[]): boolean {
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

  private async parseEmailContent(source: Buffer): Promise<string | null> {
    try {
      const raw = source.toString('utf-8')

      // Find the content after headers (double newline)
      const headerEnd = raw.indexOf('\r\n\r\n')
      if (headerEnd === -1) return null

      let content = raw.slice(headerEnd + 4)

      // Handle multipart emails - extract text/plain part
      const contentTypeMatch = raw.match(/Content-Type:\s*([^;\r\n]+)/i)
      const contentType = contentTypeMatch?.[1]?.toLowerCase() || ''

      if (contentType.includes('multipart')) {
        // Extract boundary
        const boundaryMatch = raw.match(/boundary="?([^"\r\n;]+)"?/i)
        if (boundaryMatch) {
          const boundary = boundaryMatch[1]
          const parts = content.split(`--${boundary}`)

          // Find text/plain part
          for (const part of parts) {
            if (part.toLowerCase().includes('content-type: text/plain')) {
              const partContentStart = part.indexOf('\r\n\r\n')
              if (partContentStart !== -1) {
                content = part.slice(partContentStart + 4)
                break
              }
            }
          }
        }
      }

      // Handle quoted-printable encoding
      if (raw.toLowerCase().includes('content-transfer-encoding: quoted-printable')) {
        content = this.decodeQuotedPrintable(content)
      }

      // Handle base64 encoding
      if (raw.toLowerCase().includes('content-transfer-encoding: base64')) {
        content = Buffer.from(content.replace(/\s/g, ''), 'base64').toString('utf-8')
      }

      // Clean up the content
      content = this.cleanEmailContent(content)

      return content.trim() || null
    } catch (err) {
      log.messaging.error('Failed to parse email content', {
        connectionId: this.connectionId,
        error: String(err),
      })
      return null
    }
  }

  private decodeQuotedPrintable(str: string): string {
    return str
      .replace(/=\r?\n/g, '') // Remove soft line breaks
      .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  }

  private cleanEmailContent(content: string): string {
    let cleaned = content

    // Strip signatures
    for (const pattern of SIGNATURE_PATTERNS) {
      const match = cleaned.match(pattern)
      if (match) {
        cleaned = cleaned.slice(0, match.index)
      }
    }

    // Strip quoted replies
    for (const pattern of QUOTED_REPLY_PATTERNS) {
      const match = cleaned.match(pattern)
      if (match && match.index !== undefined) {
        cleaned = cleaned.slice(0, match.index)
      }
    }

    // Normalize whitespace
    cleaned = cleaned
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    return cleaned
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

  /**
   * Send a canned response to unauthorized senders.
   */
  private async sendUnauthorizedResponse(headers: EmailHeaders): Promise<void> {
    if (!this.transporter || !this.credentials || !headers.from) return

    const response = `Sorry, I'm not able to respond to messages from your email address.

If you believe this is an error, please contact the owner of this email address.`

    try {
      // Build threading headers
      const emailHeaders: Record<string, string> = {}
      if (headers.messageId) {
        emailHeaders['In-Reply-To'] = headers.messageId
        emailHeaders['References'] = headers.messageId
      }

      let subject = 'Unable to Process Your Request'
      if (headers.subject) {
        subject = headers.subject.startsWith('Re:') ? headers.subject : `Re: ${headers.subject}`
      }

      await this.transporter.sendMail({
        from: this.getFromAddress(),
        to: headers.from,
        subject,
        text: response,
        html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6;"><p>${response.replace(/\n/g, '<br>')}</p></div>`,
        headers: emailHeaders,
      })

      log.messaging.info('Sent unauthorized response', {
        connectionId: this.connectionId,
        to: headers.from,
      })
    } catch (err) {
      log.messaging.error('Failed to send unauthorized response', {
        connectionId: this.connectionId,
        to: headers.from,
        error: String(err),
      })
    }
  }

  async sendMessage(recipientId: string, content: string, metadata?: Record<string, unknown>): Promise<boolean> {
    if (!this.transporter || !this.credentials) {
      log.messaging.warn('Cannot send email - not connected', {
        connectionId: this.connectionId,
        status: this.status,
      })
      return false
    }

    try {
      // Convert markdown-like formatting to HTML
      const htmlContent = this.formatAsHtml(content)

      // Build email headers for proper threading
      const headers: Record<string, string> = {}

      if (metadata?.messageId) {
        headers['In-Reply-To'] = metadata.messageId as string

        // Build References chain
        const refs: string[] = []
        if (metadata.references && Array.isArray(metadata.references)) {
          refs.push(...metadata.references)
        }
        if (metadata.messageId) {
          refs.push(metadata.messageId as string)
        }
        if (refs.length > 0) {
          headers['References'] = refs.join(' ')
        }
      }

      // Use original subject with Re: prefix if replying
      let subject = 'Fulcrum AI Assistant'
      if (metadata?.subject) {
        const originalSubject = metadata.subject as string
        subject = originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`
      }

      await this.transporter.sendMail({
        from: this.getFromAddress(),
        to: recipientId,
        subject,
        text: content,
        html: htmlContent,
        headers,
      })

      log.messaging.info('Email sent', {
        connectionId: this.connectionId,
        to: recipientId,
        contentLength: content.length,
        subject,
      })

      return true
    } catch (err) {
      log.messaging.error('Failed to send email', {
        connectionId: this.connectionId,
        to: recipientId,
        error: String(err),
      })
      return false
    }
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

  private formatAsHtml(content: string): string {
    // Basic markdown to HTML conversion
    const html = content
      // Escape HTML
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Code blocks
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Bold
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      // Headers
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // Line breaks
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')

    return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6;"><p>${html}</p></div>`
  }

  getStatus(): ConnectionStatus {
    return this.status
  }

  private updateStatus(status: ConnectionStatus): void {
    this.status = status

    // Update database
    db.update(messagingConnections)
      .set({
        status,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(messagingConnections.id, this.connectionId))
      .run()

    // Notify listeners
    this.events?.onConnectionChange(status)
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
