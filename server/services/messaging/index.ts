/**
 * Channel Manager - Orchestrates messaging channels and routes messages to AI assistant.
 * Entry point for the messaging service layer.
 */

import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { db, messagingConnections } from '../../db'
import type { MessagingConnection } from '../../db/schema'
import { log } from '../../lib/logger'
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
import { getMessagingSystemPrompt } from './system-prompts'

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
  const connections = db
    .select()
    .from(messagingConnections)
    .where(eq(messagingConnections.enabled, true))
    .all()

  log.messaging.info('Starting messaging channels', {
    enabledCount: connections.length,
  })

  for (const conn of connections) {
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
  const { session } = getOrCreateSession(
    msg.connectionId,
    msg.senderId,
    msg.senderName
  )

  log.messaging.info('Routing message to assistant', {
    connectionId: msg.connectionId,
    senderId: msg.senderId,
    sessionId: session.id,
    channelType: msg.channelType,
  })

  try {
    // Collect full response (don't stream to messaging channels)
    let fullResponse = ''

    // Use platform-specific system prompt
    const systemPrompt = getMessagingSystemPrompt(msg.channelType)
    const stream = assistantService.streamMessage(session.id, content, {
      systemPromptOverride: systemPrompt,
    })

    for await (const event of stream) {
      if (event.type === 'content:delta') {
        fullResponse += (event.data as { text: string }).text
      } else if (event.type === 'error') {
        const errorMsg = (event.data as { message: string }).message
        await sendResponse(msg, `Sorry, an error occurred: ${errorMsg}`)
        return
      }
    }

    // Clean up response - remove <canvas>, <editor> tags and their content
    fullResponse = fullResponse
      .replace(/<canvas>[\s\S]*?<\/canvas>/g, '')
      .replace(/<editor>[\s\S]*?<\/editor>/g, '')
      .trim()

    if (fullResponse) {
      await sendResponse(msg, fullResponse)
    }
  } catch (err) {
    log.messaging.error('Error processing message through assistant', {
      connectionId: msg.connectionId,
      sessionId: session.id,
      error: String(err),
    })
    await sendResponse(msg, 'Sorry, I encountered an error processing your message.')
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
  const helpText = `*Fulcrum AI Assistant*

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
  const { session, mapping } = getOrCreateSession(
    msg.connectionId,
    msg.senderId,
    msg.senderName
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

/**
 * Get or create an email connection.
 */
export function getOrCreateEmailConnection(): MessagingConnection {
  const existing = db
    .select()
    .from(messagingConnections)
    .where(eq(messagingConnections.channelType, 'email'))
    .get()

  if (existing) return existing

  const now = new Date().toISOString()
  const id = nanoid()

  const newConn = {
    id,
    channelType: 'email' as const,
    enabled: false,
    status: 'credentials_required' as const,
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
 * Configure email with credentials and enable the channel.
 */
export async function configureEmail(credentials: EmailAuthState): Promise<MessagingConnection> {
  const conn = getOrCreateEmailConnection()

  // Stop existing channel if running
  await stopChannel(conn.id)

  // Update connection with credentials
  db.update(messagingConnections)
    .set({
      enabled: true,
      authState: credentials,
      displayName: credentials.smtp.user,
      status: 'connecting',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(messagingConnections.id, conn.id))
    .run()

  // Start the channel
  const updatedConn = db
    .select()
    .from(messagingConnections)
    .where(eq(messagingConnections.id, conn.id))
    .get()!

  await startChannel(updatedConn)

  return db
    .select()
    .from(messagingConnections)
    .where(eq(messagingConnections.id, conn.id))
    .get()!
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
export async function disableEmail(): Promise<MessagingConnection> {
  const conn = getOrCreateEmailConnection()

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
 * Get email connection status.
 */
export function getEmailStatus(): MessagingConnection | null {
  return db
    .select()
    .from(messagingConnections)
    .where(eq(messagingConnections.channelType, 'email'))
    .get() ?? null
}

/**
 * Get email configuration (without password).
 */
export function getEmailConfig(): {
  smtp: { host: string; port: number; secure: boolean; user: string } | null
  imap: { host: string; port: number; secure: boolean; user: string } | null
  pollIntervalSeconds: number
} | null {
  const conn = getEmailStatus()
  if (!conn?.authState) return null

  const auth = conn.authState as EmailAuthState
  return {
    smtp: {
      host: auth.smtp.host,
      port: auth.smtp.port,
      secure: auth.smtp.secure,
      user: auth.smtp.user,
    },
    imap: {
      host: auth.imap.host,
      port: auth.imap.port,
      secure: auth.imap.secure,
      user: auth.imap.user,
    },
    pollIntervalSeconds: auth.pollIntervalSeconds,
  }
}

// Re-export types
export * from './types'
export * from './session-mapper'
