/**
 * Channel Manager - Orchestrates messaging channels and routes messages to AI assistant.
 * Entry point for the messaging service layer.
 */

import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { db, messagingConnections } from '../../db'
import type { MessagingConnection } from '../../db/schema'
import { log } from '../../lib/logger'
import { getSettings, updateSettingByPath } from '../../lib/settings'
import { broadcast } from '../../websocket/terminal-ws'
import { WhatsAppChannel } from './whatsapp-channel'
import { EmailChannel, testEmailCredentials as testEmailCreds } from './email-channel'
import { getOrCreateSession, resetSession } from './session-mapper'
import * as assistantService from '../assistant-service'
import type {
  MessagingChannel,
  ConnectionStatus,
  IncomingMessage,
  EmailAuthState,
} from './types'
import { getConciergeSystemPrompt, type ConciergeMessageContext } from './system-prompts'

// Active channel instances
const activeChannels = new Map<string, MessagingChannel>()

// Special commands that don't go to the AI
const COMMANDS = {
  RESET: ['/reset', '/new', '/clear'],
  HELP: ['/help', '/?'],
  STATUS: ['/status'],
}

/**
 * Start all enabled messaging channels.
 * Called on server startup.
 */
export async function startMessagingChannels(): Promise<void> {
  const settings = getSettings()

  // Start email channel if enabled in settings
  if (settings.channels.email.enabled) {
    try {
      await startEmailChannel()
    } catch (err) {
      log.messaging.error('Failed to start email channel', {
        error: String(err),
      })
    }
  }

  // Start WhatsApp and other database-tracked channels
  const connections = db
    .select()
    .from(messagingConnections)
    .where(eq(messagingConnections.enabled, true))
    .all()

  // Filter out email (now handled via settings)
  const nonEmailConnections = connections.filter(c => c.channelType !== 'email')

  log.messaging.info('Starting messaging channels', {
    emailEnabled: settings.channels.email.enabled,
    otherChannels: nonEmailConnections.length,
  })

  for (const conn of nonEmailConnections) {
    try {
      await startChannel(conn)
    } catch (err) {
      log.messaging.error('Failed to start channel', {
        connectionId: conn.id,
        channelType: conn.channelType,
        error: String(err),
      })
    }
  }
}

/**
 * Stop all active messaging channels.
 * Called on server shutdown.
 */
export async function stopMessagingChannels(): Promise<void> {
  log.messaging.info('Stopping all messaging channels', {
    activeCount: activeChannels.size,
  })

  const shutdownPromises: Promise<void>[] = []

  for (const [id, channel] of activeChannels) {
    shutdownPromises.push(
      channel.shutdown().catch((err) => {
        log.messaging.error('Error shutting down channel', {
          connectionId: id,
          error: String(err),
        })
      })
    )
  }

  await Promise.all(shutdownPromises)
  activeChannels.clear()
}

/**
 * Start a specific channel.
 */
async function startChannel(conn: MessagingConnection): Promise<void> {
  if (activeChannels.has(conn.id)) {
    log.messaging.warn('Channel already active', { connectionId: conn.id })
    return
  }

  let channel: MessagingChannel

  switch (conn.channelType) {
    case 'whatsapp':
      channel = new WhatsAppChannel(conn.id)
      break
    case 'email':
      channel = new EmailChannel(conn.id, conn.authState as EmailAuthState | undefined)
      break
    default:
      log.messaging.warn('Unknown channel type', {
        connectionId: conn.id,
        channelType: conn.channelType,
      })
      return
  }

  await channel.initialize({
    onMessage: (msg) => handleIncomingMessage(msg),
    onConnectionChange: (status) => handleConnectionChange(conn.id, status),
    onAuthRequired: (data) => handleAuthRequired(conn.id, data),
    onDisplayNameChange: (name) => handleDisplayNameChange(conn.id, name),
  })

  activeChannels.set(conn.id, channel)
  log.messaging.info('Channel started', {
    connectionId: conn.id,
    channelType: conn.channelType,
  })
}

/**
 * Stop a specific channel.
 */
async function stopChannel(connectionId: string): Promise<void> {
  const channel = activeChannels.get(connectionId)
  if (!channel) return

  await channel.shutdown()
  activeChannels.delete(connectionId)

  log.messaging.info('Channel stopped', { connectionId })
}

/**
 * Handle incoming message from any channel.
 * Routes to AI assistant and sends response back.
 */
async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  const content = msg.content.trim()

  // Check for special commands
  if (COMMANDS.RESET.some((cmd) => content.toLowerCase() === cmd)) {
    // For email, reset doesn't make sense - each thread is its own session
    if (msg.channelType === 'email') {
      await sendResponse(msg, 'To start a new conversation, simply send a new email (not a reply). Each email thread has its own conversation history.')
      return
    }
    await handleResetCommand(msg)
    return
  }

  if (COMMANDS.HELP.some((cmd) => content.toLowerCase() === cmd)) {
    await handleHelpCommand(msg)
    return
  }

  if (COMMANDS.STATUS.some((cmd) => content.toLowerCase() === cmd)) {
    await handleStatusCommand(msg)
    return
  }

  // Route to AI assistant
  // For email, use threadId as session key (each email thread = separate conversation)
  // For other channels, use senderId (each user = separate conversation)
  const emailThreadId = msg.channelType === 'email' ? (msg.metadata?.threadId as string) : undefined
  const { session } = getOrCreateSession(
    msg.connectionId,
    msg.senderId,
    msg.senderName,
    emailThreadId
  )

  log.messaging.info('Routing message to assistant', {
    connectionId: msg.connectionId,
    senderId: msg.senderId,
    sessionId: session.id,
    channelType: msg.channelType,
  })

  try {
    // Build context for intelligent message handling
    // The assistant decides whether to respond, create events, or ignore
    const context: ConciergeMessageContext = {
      channel: msg.channelType,
      sender: msg.senderId,
      senderName: msg.senderName,
      content,
      metadata: {
        subject: msg.metadata?.subject as string | undefined,
        threadId: msg.metadata?.threadId as string | undefined,
        messageId: msg.metadata?.messageId as string | undefined,
      },
    }
    const systemPrompt = getConciergeSystemPrompt(msg.channelType, context)

    // Stream the response - assistant handles everything via tools
    const stream = assistantService.streamMessage(session.id, content, {
      systemPromptOverride: systemPrompt,
    })

    // Consume stream - responses are sent via the message tool
    for await (const event of stream) {
      if (event.type === 'error') {
        const errorMsg = (event.data as { message: string }).message
        log.messaging.error('Assistant error handling message', { error: errorMsg })
      }
    }
  } catch (err) {
    log.messaging.error('Error processing message through assistant', {
      connectionId: msg.connectionId,
      sessionId: session.id,
      error: String(err),
    })
  }
}

/**
 * Handle /reset command - start fresh conversation.
 */
async function handleResetCommand(msg: IncomingMessage): Promise<void> {
  resetSession(msg.connectionId, msg.senderId, msg.senderName)
  await sendResponse(
    msg,
    "Conversation reset! I've started a fresh session. How can I help you?"
  )
}

/**
 * Handle /help command.
 */
async function handleHelpCommand(msg: IncomingMessage): Promise<void> {
  const isEmail = msg.channelType === 'email'

  const helpText = isEmail
    ? `*Fulcrum AI Assistant*

I'm Claude, ready to help you with questions and tasks.

*Available commands:*
/help - Show this help message
/status - Show session info

*Email threading:*
Each email thread has its own conversation history. To start a fresh conversation, send a new email (not a reply).

Just send any message and I'll do my best to help!`
    : `*Fulcrum AI Assistant*

I'm Claude, ready to help you with questions and tasks.

*Available commands:*
/reset - Start a fresh conversation
/help - Show this help message
/status - Show session info

Just send any message and I'll do my best to help!`

  await sendResponse(msg, helpText)
}

/**
 * Handle /status command.
 */
async function handleStatusCommand(msg: IncomingMessage): Promise<void> {
  const emailThreadId = msg.channelType === 'email' ? (msg.metadata?.threadId as string) : undefined
  const { session, mapping } = getOrCreateSession(
    msg.connectionId,
    msg.senderId,
    msg.senderName,
    emailThreadId
  )

  const statusText = `*Session Status*

Session ID: ${session.id.slice(0, 8)}...
Messages: ${session.messageCount ?? 0}
Started: ${new Date(mapping.createdAt).toLocaleString()}
Last active: ${new Date(mapping.lastMessageAt).toLocaleString()}`

  await sendResponse(msg, statusText)
}

/**
 * Send a response back through the appropriate channel.
 */
async function sendResponse(
  originalMsg: IncomingMessage,
  content: string
): Promise<void> {
  const channel = activeChannels.get(originalMsg.connectionId)
  if (!channel) {
    log.messaging.warn('No active channel to send response', {
      connectionId: originalMsg.connectionId,
    })
    return
  }

  // WhatsApp has a message size limit, split if needed
  const maxLength = 4000
  const parts = splitMessage(content, maxLength)

  for (const part of parts) {
    // Pass metadata for email threading (ignored by other channels)
    await channel.sendMessage(originalMsg.senderId, part, originalMsg.metadata)
    // Small delay between parts to maintain order
    if (parts.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
}

/**
 * Split a message into parts that fit within a size limit.
 */
function splitMessage(content: string, maxLength: number): string[] {
  if (content.length <= maxLength) return [content]

  const parts: string[] = []
  let remaining = content

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      parts.push(remaining)
      break
    }

    // Try to split at a paragraph break
    let splitIdx = remaining.lastIndexOf('\n\n', maxLength)

    // Fall back to newline
    if (splitIdx === -1 || splitIdx < maxLength / 2) {
      splitIdx = remaining.lastIndexOf('\n', maxLength)
    }

    // Fall back to space
    if (splitIdx === -1 || splitIdx < maxLength / 2) {
      splitIdx = remaining.lastIndexOf(' ', maxLength)
    }

    // Fall back to hard cut
    if (splitIdx === -1 || splitIdx < maxLength / 2) {
      splitIdx = maxLength
    }

    parts.push(remaining.slice(0, splitIdx).trim())
    remaining = remaining.slice(splitIdx).trim()
  }

  return parts
}

/**
 * Handle connection status changes - broadcast to WebSocket clients.
 */
function handleConnectionChange(connectionId: string, status: ConnectionStatus): void {
  broadcast({
    type: 'messaging:status',
    payload: {
      connectionId,
      status,
    },
  })
}

/**
 * Handle auth required - broadcast QR code to WebSocket clients.
 */
function handleAuthRequired(connectionId: string, data: { qrDataUrl: string }): void {
  broadcast({
    type: 'messaging:qr',
    payload: {
      connectionId,
      qrDataUrl: data.qrDataUrl,
    },
  })
}

/**
 * Handle display name change - broadcast to WebSocket clients.
 */
function handleDisplayNameChange(connectionId: string, displayName: string): void {
  broadcast({
    type: 'messaging:displayName',
    payload: {
      connectionId,
      displayName,
    },
  })
}

// ==================== API Functions ====================

/**
 * Get or create a WhatsApp connection.
 */
export function getOrCreateWhatsAppConnection(): MessagingConnection {
  const existing = db
    .select()
    .from(messagingConnections)
    .where(eq(messagingConnections.channelType, 'whatsapp'))
    .get()

  if (existing) return existing

  const now = new Date().toISOString()
  const id = nanoid()

  const newConn = {
    id,
    channelType: 'whatsapp' as const,
    enabled: false,
    status: 'disconnected' as const,
    createdAt: now,
    updatedAt: now,
  }

  db.insert(messagingConnections).values(newConn).run()

  return db
    .select()
    .from(messagingConnections)
    .where(eq(messagingConnections.id, id))
    .get()!
}

/**
 * Enable WhatsApp and start the channel.
 */
export async function enableWhatsApp(): Promise<MessagingConnection> {
  const conn = getOrCreateWhatsAppConnection()

  db.update(messagingConnections)
    .set({
      enabled: true,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(messagingConnections.id, conn.id))
    .run()

  await startChannel({ ...conn, enabled: true })

  return db
    .select()
    .from(messagingConnections)
    .where(eq(messagingConnections.id, conn.id))
    .get()!
}

/**
 * Disable WhatsApp and stop the channel.
 */
export async function disableWhatsApp(): Promise<MessagingConnection> {
  const conn = getOrCreateWhatsAppConnection()

  await stopChannel(conn.id)

  db.update(messagingConnections)
    .set({
      enabled: false,
      status: 'disconnected',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(messagingConnections.id, conn.id))
    .run()

  return db
    .select()
    .from(messagingConnections)
    .where(eq(messagingConnections.id, conn.id))
    .get()!
}

/**
 * Request QR code for WhatsApp authentication.
 */
export async function requestWhatsAppAuth(): Promise<{ qrDataUrl: string }> {
  const conn = getOrCreateWhatsAppConnection()
  let channel = activeChannels.get(conn.id)

  if (!channel) {
    // Start the channel first if not active
    await enableWhatsApp()
    channel = activeChannels.get(conn.id)
  }

  if (!channel?.requestAuth) {
    throw new Error('Channel does not support authentication')
  }

  return channel.requestAuth()
}

/**
 * Disconnect WhatsApp (logout and clear auth).
 */
export async function disconnectWhatsApp(): Promise<MessagingConnection> {
  const conn = getOrCreateWhatsAppConnection()
  const channel = activeChannels.get(conn.id)

  if (channel?.logout) {
    await channel.logout()
  }

  await stopChannel(conn.id)

  db.update(messagingConnections)
    .set({
      enabled: false,
      status: 'disconnected',
      displayName: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(messagingConnections.id, conn.id))
    .run()

  return db
    .select()
    .from(messagingConnections)
    .where(eq(messagingConnections.id, conn.id))
    .get()!
}

/**
 * Get WhatsApp connection status.
 */
export function getWhatsAppStatus(): MessagingConnection | null {
  return db
    .select()
    .from(messagingConnections)
    .where(eq(messagingConnections.channelType, 'whatsapp'))
    .get() ?? null
}

/**
 * List all messaging connections.
 */
export function listConnections(): MessagingConnection[] {
  return db.select().from(messagingConnections).all()
}

// ==================== Email API Functions ====================

// Email channel connection ID (constant since there's only one email channel)
const EMAIL_CONNECTION_ID = 'email-channel'

// Track the active email channel
let activeEmailChannel: EmailChannel | null = null

/**
 * Start the email channel from settings.
 */
async function startEmailChannel(): Promise<void> {
  const settings = getSettings()
  const emailConfig = settings.channels.email

  if (!emailConfig.enabled) {
    log.messaging.debug('Email channel not enabled')
    return
  }

  // Check if we have valid credentials
  if (!emailConfig.smtp.host || !emailConfig.smtp.user || !emailConfig.smtp.password) {
    log.messaging.warn('Email enabled but SMTP credentials incomplete')
    return
  }

  if (!emailConfig.imap.host || !emailConfig.imap.user || !emailConfig.imap.password) {
    log.messaging.warn('Email enabled but IMAP credentials incomplete')
    return
  }

  // Convert settings to EmailAuthState format
  const credentials: EmailAuthState = {
    smtp: emailConfig.smtp,
    imap: emailConfig.imap,
    pollIntervalSeconds: emailConfig.pollIntervalSeconds,
    sendAs: emailConfig.sendAs || undefined,
    allowedSenders: emailConfig.allowedSenders,
  }

  // Create and initialize the email channel
  const channel = new EmailChannel(EMAIL_CONNECTION_ID, credentials)

  await channel.initialize({
    onMessage: (msg) => handleIncomingMessage(msg),
    onConnectionChange: (status) => handleConnectionChange(EMAIL_CONNECTION_ID, status),
    onAuthRequired: (data) => handleAuthRequired(EMAIL_CONNECTION_ID, data),
    onDisplayNameChange: (name) => handleDisplayNameChange(EMAIL_CONNECTION_ID, name),
  })

  activeEmailChannel = channel
  activeChannels.set(EMAIL_CONNECTION_ID, channel)

  log.messaging.info('Email channel started from settings', {
    smtpHost: emailConfig.smtp.host,
    imapHost: emailConfig.imap.host,
  })
}

/**
 * Stop the email channel.
 */
async function stopEmailChannel(): Promise<void> {
  if (activeEmailChannel) {
    await activeEmailChannel.shutdown()
    activeEmailChannel = null
    activeChannels.delete(EMAIL_CONNECTION_ID)
    log.messaging.info('Email channel stopped')
  }
}

/**
 * Configure email with credentials and enable the channel.
 * Saves configuration to settings.json and starts the channel.
 */
export async function configureEmail(credentials: EmailAuthState): Promise<{
  enabled: boolean
  status: ConnectionStatus
}> {
  // Stop existing channel if running
  await stopEmailChannel()

  // Save credentials to settings
  updateSettingByPath('channels.email.enabled', true)
  updateSettingByPath('channels.email.smtp.host', credentials.smtp.host)
  updateSettingByPath('channels.email.smtp.port', credentials.smtp.port)
  updateSettingByPath('channels.email.smtp.secure', credentials.smtp.secure)
  updateSettingByPath('channels.email.smtp.user', credentials.smtp.user)
  updateSettingByPath('channels.email.smtp.password', credentials.smtp.password)
  updateSettingByPath('channels.email.imap.host', credentials.imap.host)
  updateSettingByPath('channels.email.imap.port', credentials.imap.port)
  updateSettingByPath('channels.email.imap.secure', credentials.imap.secure)
  updateSettingByPath('channels.email.imap.user', credentials.imap.user)
  updateSettingByPath('channels.email.imap.password', credentials.imap.password)
  updateSettingByPath('channels.email.pollIntervalSeconds', credentials.pollIntervalSeconds)
  updateSettingByPath('channels.email.sendAs', credentials.sendAs || null)
  updateSettingByPath('channels.email.allowedSenders', credentials.allowedSenders || [])

  // Start the channel
  await startEmailChannel()

  return {
    enabled: true,
    status: activeEmailChannel?.getStatus() || 'connecting',
  }
}

/**
 * Test email credentials without saving them.
 */
export async function testEmailCredentials(credentials: EmailAuthState): Promise<{
  success: boolean
  smtpOk: boolean
  imapOk: boolean
  error?: string
}> {
  return testEmailCreds(credentials)
}

/**
 * Disable email and stop the channel.
 */
export async function disableEmail(): Promise<{
  enabled: boolean
  status: ConnectionStatus
}> {
  await stopEmailChannel()

  // Update settings to disable
  updateSettingByPath('channels.email.enabled', false)

  return {
    enabled: false,
    status: 'disconnected',
  }
}

/**
 * Enable email using existing credentials from settings.
 * Returns an error if credentials are not configured.
 */
export async function enableEmail(): Promise<{
  enabled: boolean
  status: ConnectionStatus
  error?: string
}> {
  const settings = getSettings()
  const emailConfig = settings.channels.email

  // Check if we have valid credentials
  if (!emailConfig.smtp.host || !emailConfig.smtp.user || !emailConfig.smtp.password ||
      !emailConfig.imap.host || !emailConfig.imap.user || !emailConfig.imap.password) {
    return {
      enabled: false,
      status: 'credentials_required',
      error: 'Email credentials not configured. Please configure SMTP and IMAP settings first.',
    }
  }

  // Stop existing channel if running
  await stopEmailChannel()

  // Update settings to enable
  updateSettingByPath('channels.email.enabled', true)

  // Start the channel
  await startEmailChannel()

  return {
    enabled: true,
    status: activeEmailChannel?.getStatus() || 'connecting',
  }
}

/**
 * Get email connection status.
 */
export function getEmailStatus(): {
  enabled: boolean
  status: ConnectionStatus
} {
  const settings = getSettings()
  const emailConfig = settings.channels.email

  if (!emailConfig.enabled) {
    return { enabled: false, status: 'disconnected' }
  }

  // Check if we have valid credentials
  if (!emailConfig.smtp.host || !emailConfig.smtp.user || !emailConfig.smtp.password ||
      !emailConfig.imap.host || !emailConfig.imap.user || !emailConfig.imap.password) {
    return { enabled: true, status: 'credentials_required' }
  }

  return {
    enabled: true,
    status: activeEmailChannel?.getStatus() || 'disconnected',
  }
}

/**
 * Get email configuration (passwords masked with ********).
 */
export function getEmailConfig(): {
  smtp: { host: string; port: number; secure: boolean; user: string; password: string } | null
  imap: { host: string; port: number; secure: boolean; user: string; password: string } | null
  pollIntervalSeconds: number
  sendAs: string | null
  allowedSenders: string[]
} | null {
  const settings = getSettings()
  const emailConfig = settings.channels.email

  if (!emailConfig.smtp.host && !emailConfig.imap.host) {
    return null
  }

  return {
    smtp: emailConfig.smtp.host ? {
      host: emailConfig.smtp.host,
      port: emailConfig.smtp.port,
      secure: emailConfig.smtp.secure,
      user: emailConfig.smtp.user,
      password: emailConfig.smtp.password ? '••••••••' : '',
    } : null,
    imap: emailConfig.imap.host ? {
      host: emailConfig.imap.host,
      port: emailConfig.imap.port,
      secure: emailConfig.imap.secure,
      user: emailConfig.imap.user,
      password: emailConfig.imap.password ? '••••••••' : '',
    } : null,
    pollIntervalSeconds: emailConfig.pollIntervalSeconds,
    sendAs: emailConfig.sendAs,
    allowedSenders: emailConfig.allowedSenders,
  }
}

// Re-export types
export * from './types'
export * from './session-mapper'

// ==========================================================================
// Email Search & Storage API
// ==========================================================================

/**
 * Get stored emails from the local database.
 */
export function getStoredEmails(options?: {
  limit?: number
  offset?: number
  direction?: 'incoming' | 'outgoing'
  threadId?: string
  search?: string
  folder?: string
}) {
  if (!activeEmailChannel) {
    return []
  }
  return activeEmailChannel.getStoredEmails(options)
}

/**
 * Search emails via IMAP and return matching UIDs.
 */
export async function searchImapEmails(criteria: {
  subject?: string
  from?: string
  to?: string
  since?: Date
  before?: Date
  text?: string
  seen?: boolean
  flagged?: boolean
}): Promise<number[]> {
  if (!activeEmailChannel) {
    throw new Error('Email channel not configured')
  }
  return activeEmailChannel.searchImapEmails(criteria)
}

/**
 * Fetch emails by UID from IMAP and store them locally.
 */
export async function fetchAndStoreEmails(uids: number[], options?: { limit?: number }) {
  if (!activeEmailChannel) {
    throw new Error('Email channel not configured')
  }
  return activeEmailChannel.fetchAndStoreEmails(uids, options)
}

// ==================== Send Message Functions (for concierge) ====================

/**
 * Send an email message directly.
 * Used by the concierge scheduler for proactive messaging.
 */
export async function sendEmailMessage(
  to: string,
  body: string,
  subject?: string,
  replyToMessageId?: string
): Promise<string | undefined> {
  if (!activeEmailChannel) {
    throw new Error('Email channel not configured or not connected')
  }

  const success = await activeEmailChannel.sendMessage(to, body, {
    subject,
    messageId: replyToMessageId,
  })

  if (!success) {
    throw new Error('Failed to send email')
  }

  // Return a placeholder message ID (actual ID is in the sent email)
  return `sent-${Date.now()}`
}

/**
 * Send a WhatsApp message directly.
 * Used by the assistant scheduler for proactive messaging.
 */
export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  const channel = activeChannels.get('whatsapp') as WhatsAppChannel | undefined
  if (!channel) {
    throw new Error('WhatsApp channel not configured or not connected')
  }

  const success = await channel.sendMessage(to, body)
  if (!success) {
    throw new Error('Failed to send WhatsApp message')
  }
}

/**
 * Send a message to a channel.
 * Unified interface for sending messages across all supported channels.
 */
export async function sendMessageToChannel(
  channel: 'email' | 'whatsapp' | 'telegram' | 'slack',
  to: string,
  body: string,
  options?: {
    subject?: string
    replyToMessageId?: string
  }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  switch (channel) {
    case 'email': {
      const emailStatus = getEmailStatus()
      if (!emailStatus.enabled || emailStatus.status !== 'connected') {
        return { success: false, error: 'Email channel not connected' }
      }

      try {
        const messageId = await sendEmailMessage(to, body, options?.subject, options?.replyToMessageId)
        log.messaging.info('Sent email message', { to, subject: options?.subject, messageId })
        return { success: true, messageId }
      } catch (err) {
        log.messaging.error('Failed to send email', { to, error: String(err) })
        return { success: false, error: String(err) }
      }
    }

    case 'whatsapp': {
      const waStatus = getWhatsAppStatus()
      if (!waStatus?.enabled || waStatus.status !== 'connected') {
        return { success: false, error: 'WhatsApp channel not connected' }
      }

      try {
        await sendWhatsAppMessage(to, body)
        log.messaging.info('Sent WhatsApp message', { to })
        return { success: true }
      } catch (err) {
        log.messaging.error('Failed to send WhatsApp message', { to, error: String(err) })
        return { success: false, error: String(err) }
      }
    }

    case 'telegram':
    case 'slack':
      return { success: false, error: `${channel} channel not implemented` }

    default:
      return { success: false, error: `Unknown channel: ${channel}` }
  }
}
