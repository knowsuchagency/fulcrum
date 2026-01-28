/**
 * Channel Manager - Core lifecycle management for messaging channels.
 * Handles starting/stopping channels, broadcast handlers, and shared state.
 */

import { eq } from 'drizzle-orm'
import { db, messagingConnections } from '../../db'
import type { MessagingConnection } from '../../db/schema'
import { log } from '../../lib/logger'
import { getSettings } from '../../lib/settings'
import { broadcast } from '../../websocket/terminal-ws'
import { WhatsAppChannel } from './whatsapp-channel'
import { DiscordChannel } from './discord-channel'
import { TelegramChannel } from './telegram-channel'
import { SlackChannel } from './slack-channel'
import { EmailChannel } from './email-channel'
import type {
  MessagingChannel,
  ConnectionStatus,
  IncomingMessage,
  EmailAuthState,
  ChannelFactory,
} from './types'

// Active channel instances
export const activeChannels = new Map<string, MessagingChannel>()

// Default channel factory using real implementations
const defaultChannelFactory: ChannelFactory = {
  createWhatsAppChannel: (id) => new WhatsAppChannel(id),
  createDiscordChannel: (id) => new DiscordChannel(id),
  createTelegramChannel: (id) => new TelegramChannel(id),
  createSlackChannel: (id) => new SlackChannel(id),
  createEmailChannel: (id, authState) => new EmailChannel(id, authState),
}

// Current factory (can be overridden for testing)
let channelFactory: ChannelFactory = defaultChannelFactory

/**
 * Set a custom channel factory (for testing).
 */
export function setChannelFactory(factory: ChannelFactory): void {
  channelFactory = factory
}

/**
 * Reset to the default channel factory.
 */
export function resetChannelFactory(): void {
  channelFactory = defaultChannelFactory
}

/**
 * Get the current channel factory (for internal use).
 */
export function getChannelFactory(): ChannelFactory {
  return channelFactory
}

// Connection IDs for settings-based channels (constant since there's only one per type)
export const SLACK_CONNECTION_ID = 'slack-channel'
export const DISCORD_CONNECTION_ID = 'discord-channel'
export const TELEGRAM_CONNECTION_ID = 'telegram-channel'
export const EMAIL_CONNECTION_ID = 'email-channel'

// Track active settings-based channels (internal state)
let _activeSlackChannel: SlackChannel | null = null
let _activeDiscordChannel: DiscordChannel | null = null
let _activeTelegramChannel: TelegramChannel | null = null
let _activeEmailChannel: EmailChannel | null = null

// Getter functions for active channels
export function getActiveSlackChannel(): SlackChannel | null {
  return _activeSlackChannel
}

export function getActiveDiscordChannel(): DiscordChannel | null {
  return _activeDiscordChannel
}

export function getActiveTelegramChannel(): TelegramChannel | null {
  return _activeTelegramChannel
}

export function getActiveEmailChannel(): EmailChannel | null {
  return _activeEmailChannel
}

// Message handler - will be set by message-handler.ts to avoid circular imports
let messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null

/**
 * Set the message handler function.
 * Called by message-handler.ts during initialization.
 */
export function setMessageHandler(handler: (msg: IncomingMessage) => Promise<void>): void {
  messageHandler = handler
}

/**
 * Handle connection status changes - broadcast to WebSocket clients.
 */
export function handleConnectionChange(connectionId: string, status: ConnectionStatus): void {
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
export function handleAuthRequired(connectionId: string, data: { qrDataUrl: string }): void {
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
export function handleDisplayNameChange(connectionId: string, displayName: string): void {
  broadcast({
    type: 'messaging:displayName',
    payload: {
      connectionId,
      displayName,
    },
  })
}

/**
 * Start a specific channel from database connection.
 */
export async function startChannel(conn: MessagingConnection): Promise<void> {
  if (activeChannels.has(conn.id)) {
    log.messaging.warn('Channel already active', { connectionId: conn.id })
    return
  }

  if (!messageHandler) {
    throw new Error('Message handler not initialized')
  }

  let channel: MessagingChannel

  switch (conn.channelType) {
    case 'whatsapp':
      channel = channelFactory.createWhatsAppChannel(conn.id)
      break
    case 'discord':
      channel = channelFactory.createDiscordChannel(conn.id)
      break
    case 'telegram':
      channel = channelFactory.createTelegramChannel(conn.id)
      break
    case 'slack':
      channel = channelFactory.createSlackChannel(conn.id)
      break
    case 'email':
      channel = channelFactory.createEmailChannel(conn.id, conn.authState as EmailAuthState | undefined)
      break
    default:
      log.messaging.warn('Unknown channel type', {
        connectionId: conn.id,
        channelType: conn.channelType,
      })
      return
  }

  await channel.initialize({
    onMessage: (msg) => messageHandler!(msg),
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
export async function stopChannel(connectionId: string): Promise<void> {
  const channel = activeChannels.get(connectionId)
  if (!channel) return

  await channel.shutdown()
  activeChannels.delete(connectionId)

  log.messaging.info('Channel stopped', { connectionId })
}

/**
 * Start the Slack channel from settings.
 */
export async function startSlackChannel(): Promise<void> {
  const settings = getSettings()
  const slackConfig = settings.channels.slack

  if (!slackConfig.enabled) {
    log.messaging.debug('Slack channel not enabled')
    return
  }

  if (!slackConfig.botToken || !slackConfig.appToken) {
    log.messaging.warn('Slack enabled but credentials incomplete')
    return
  }

  if (!messageHandler) {
    throw new Error('Message handler not initialized')
  }

  // Create and initialize the Slack channel
  const channel = channelFactory.createSlackChannel(SLACK_CONNECTION_ID) as SlackChannel

  await channel.initialize({
    onMessage: (msg) => messageHandler!(msg),
    onConnectionChange: (status) => handleConnectionChange(SLACK_CONNECTION_ID, status),
    onAuthRequired: (data) => handleAuthRequired(SLACK_CONNECTION_ID, data),
    onDisplayNameChange: (name) => handleDisplayNameChange(SLACK_CONNECTION_ID, name),
  })

  _activeSlackChannel = channel
  activeChannels.set(SLACK_CONNECTION_ID, channel)

  log.messaging.info('Slack channel started from settings')
}

/**
 * Stop the Slack channel.
 */
export async function stopSlackChannel(): Promise<void> {
  if (_activeSlackChannel) {
    await _activeSlackChannel.shutdown()
    _activeSlackChannel = null
    activeChannels.delete(SLACK_CONNECTION_ID)
    log.messaging.info('Slack channel stopped')
  }
}

/**
 * Start the Discord channel from settings.
 */
export async function startDiscordChannel(): Promise<void> {
  const settings = getSettings()
  const discordConfig = settings.channels.discord

  if (!discordConfig.enabled) {
    log.messaging.debug('Discord channel not enabled')
    return
  }

  if (!discordConfig.botToken) {
    log.messaging.warn('Discord enabled but bot token missing')
    return
  }

  if (!messageHandler) {
    throw new Error('Message handler not initialized')
  }

  // Create and initialize the Discord channel
  const channel = channelFactory.createDiscordChannel(DISCORD_CONNECTION_ID) as DiscordChannel

  await channel.initialize({
    onMessage: (msg) => messageHandler!(msg),
    onConnectionChange: (status) => handleConnectionChange(DISCORD_CONNECTION_ID, status),
    onAuthRequired: (data) => handleAuthRequired(DISCORD_CONNECTION_ID, data),
    onDisplayNameChange: (name) => handleDisplayNameChange(DISCORD_CONNECTION_ID, name),
  })

  _activeDiscordChannel = channel
  activeChannels.set(DISCORD_CONNECTION_ID, channel)

  log.messaging.info('Discord channel started from settings')
}

/**
 * Stop the Discord channel.
 */
export async function stopDiscordChannel(): Promise<void> {
  if (_activeDiscordChannel) {
    await _activeDiscordChannel.shutdown()
    _activeDiscordChannel = null
    activeChannels.delete(DISCORD_CONNECTION_ID)
    log.messaging.info('Discord channel stopped')
  }
}

/**
 * Start the Telegram channel from settings.
 */
export async function startTelegramChannel(): Promise<void> {
  const settings = getSettings()
  const telegramConfig = settings.channels.telegram

  if (!telegramConfig.enabled) {
    log.messaging.debug('Telegram channel not enabled')
    return
  }

  if (!telegramConfig.botToken) {
    log.messaging.warn('Telegram enabled but bot token missing')
    return
  }

  if (!messageHandler) {
    throw new Error('Message handler not initialized')
  }

  // Create and initialize the Telegram channel
  const channel = channelFactory.createTelegramChannel(TELEGRAM_CONNECTION_ID) as TelegramChannel

  await channel.initialize({
    onMessage: (msg) => messageHandler!(msg),
    onConnectionChange: (status) => handleConnectionChange(TELEGRAM_CONNECTION_ID, status),
    onAuthRequired: (data) => handleAuthRequired(TELEGRAM_CONNECTION_ID, data),
    onDisplayNameChange: (name) => handleDisplayNameChange(TELEGRAM_CONNECTION_ID, name),
  })

  _activeTelegramChannel = channel
  activeChannels.set(TELEGRAM_CONNECTION_ID, channel)

  log.messaging.info('Telegram channel started from settings')
}

/**
 * Stop the Telegram channel.
 */
export async function stopTelegramChannel(): Promise<void> {
  if (_activeTelegramChannel) {
    await _activeTelegramChannel.shutdown()
    _activeTelegramChannel = null
    activeChannels.delete(TELEGRAM_CONNECTION_ID)
    log.messaging.info('Telegram channel stopped')
  }
}

/**
 * Start the email channel from settings.
 */
export async function startEmailChannel(): Promise<void> {
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

  if (!messageHandler) {
    throw new Error('Message handler not initialized')
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
  // Cast to EmailChannel for email-specific methods (getStoredEmails, searchImapEmails, etc.)
  const channel = channelFactory.createEmailChannel(EMAIL_CONNECTION_ID, credentials) as EmailChannel

  await channel.initialize({
    onMessage: (msg) => messageHandler!(msg),
    onConnectionChange: (status) => handleConnectionChange(EMAIL_CONNECTION_ID, status),
    onAuthRequired: (data) => handleAuthRequired(EMAIL_CONNECTION_ID, data),
    onDisplayNameChange: (name) => handleDisplayNameChange(EMAIL_CONNECTION_ID, name),
  })

  _activeEmailChannel = channel
  activeChannels.set(EMAIL_CONNECTION_ID, channel)

  log.messaging.info('Email channel started from settings', {
    smtpHost: emailConfig.smtp.host,
    imapHost: emailConfig.imap.host,
  })
}

/**
 * Stop the email channel.
 */
export async function stopEmailChannel(): Promise<void> {
  if (_activeEmailChannel) {
    await _activeEmailChannel.shutdown()
    _activeEmailChannel = null
    activeChannels.delete(EMAIL_CONNECTION_ID)
    log.messaging.info('Email channel stopped')
  }
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

  // Start Slack if enabled in settings
  if (settings.channels.slack.enabled) {
    try {
      await startSlackChannel()
    } catch (err) {
      log.messaging.error('Failed to start Slack channel', {
        error: String(err),
      })
    }
  }

  // Start Discord if enabled in settings
  if (settings.channels.discord.enabled) {
    try {
      await startDiscordChannel()
    } catch (err) {
      log.messaging.error('Failed to start Discord channel', {
        error: String(err),
      })
    }
  }

  // Start Telegram if enabled in settings
  if (settings.channels.telegram.enabled) {
    try {
      await startTelegramChannel()
    } catch (err) {
      log.messaging.error('Failed to start Telegram channel', {
        error: String(err),
      })
    }
  }

  // Start WhatsApp from database (still uses QR auth)
  const whatsappConn = db
    .select()
    .from(messagingConnections)
    .where(eq(messagingConnections.channelType, 'whatsapp'))
    .get()

  if (whatsappConn?.enabled) {
    try {
      await startChannel(whatsappConn)
    } catch (err) {
      log.messaging.error('Failed to start WhatsApp channel', {
        connectionId: whatsappConn.id,
        error: String(err),
      })
    }
  }

  log.messaging.info('Started messaging channels', {
    emailEnabled: settings.channels.email.enabled,
    slackEnabled: settings.channels.slack.enabled,
    discordEnabled: settings.channels.discord.enabled,
    telegramEnabled: settings.channels.telegram.enabled,
    whatsappEnabled: whatsappConn?.enabled ?? false,
  })
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

  // Clear references to active channels
  _activeSlackChannel = null
  _activeDiscordChannel = null
  _activeTelegramChannel = null
  _activeEmailChannel = null
}

/**
 * List all messaging connections from database.
 */
export function listConnections(): MessagingConnection[] {
  return db.select().from(messagingConnections).all()
}
