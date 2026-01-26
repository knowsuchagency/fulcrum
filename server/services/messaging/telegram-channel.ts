/**
 * Telegram channel implementation using node-telegram-bot-api.
 * Handles bot connection, message sending/receiving.
 */

import TelegramBot from 'node-telegram-bot-api'
import { eq } from 'drizzle-orm'
import { db, messagingConnections } from '../../db'
import { log } from '../../lib/logger'
import type {
  MessagingChannel,
  ChannelEvents,
  ConnectionStatus,
  IncomingMessage,
  TelegramAuthState,
} from './types'

export class TelegramChannel implements MessagingChannel {
  readonly type = 'telegram' as const
  readonly connectionId: string

  private bot: TelegramBot | null = null
  private events: ChannelEvents | null = null
  private status: ConnectionStatus = 'disconnected'
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private isShuttingDown = false
  private botToken: string | null = null

  constructor(connectionId: string) {
    this.connectionId = connectionId
  }

  async initialize(events: ChannelEvents): Promise<void> {
    this.events = events
    this.isShuttingDown = false

    // Load auth state from database
    const connection = db
      .select()
      .from(messagingConnections)
      .where(eq(messagingConnections.id, this.connectionId))
      .get()

    if (!connection?.authState) {
      log.messaging.warn('Telegram channel has no auth state', {
        connectionId: this.connectionId,
      })
      this.updateStatus('disconnected')
      return
    }

    try {
      const authState = JSON.parse(connection.authState) as TelegramAuthState
      this.botToken = authState.botToken
    } catch (err) {
      log.messaging.error('Failed to parse Telegram auth state', {
        connectionId: this.connectionId,
        error: String(err),
      })
      this.updateStatus('disconnected')
      return
    }

    await this.connect()
  }

  private async connect(): Promise<void> {
    if (this.isShuttingDown || !this.botToken) return

    try {
      this.updateStatus('connecting')

      // Create Telegram bot with polling
      this.bot = new TelegramBot(this.botToken, { polling: true })

      // Get bot info
      const me = await this.bot.getMe()

      log.messaging.info('Telegram bot connected', {
        connectionId: this.connectionId,
        username: me.username,
      })
      this.updateStatus('connected')

      // Store display name (bot username)
      const displayName = `@${me.username}`
      db.update(messagingConnections)
        .set({
          displayName,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(messagingConnections.id, this.connectionId))
        .run()
      this.events?.onDisplayNameChange?.(displayName)

      // Handle messages
      this.bot.on('message', (msg) => {
        this.handleMessage(msg)
      })

      // Handle polling errors
      this.bot.on('polling_error', (error) => {
        log.messaging.error('Telegram polling error', {
          connectionId: this.connectionId,
          error: String(error),
        })
        // Don't disconnect on polling errors - bot will retry
      })

      this.bot.on('error', (error) => {
        log.messaging.error('Telegram bot error', {
          connectionId: this.connectionId,
          error: String(error),
        })
        this.handleDisconnect()
      })
    } catch (err) {
      log.messaging.error('Telegram connect error', {
        connectionId: this.connectionId,
        error: String(err),
      })
      this.updateStatus('disconnected')
      this.scheduleReconnect()
    }
  }

  private async handleMessage(msg: TelegramBot.Message): Promise<void> {
    // Only process private chats (DMs with the bot)
    if (msg.chat.type !== 'private') return

    // Only process text messages
    const content = msg.text
    if (!content) return

    const incomingMessage: IncomingMessage = {
      channelType: 'telegram',
      connectionId: this.connectionId,
      senderId: msg.chat.id.toString(),
      senderName: msg.from?.username || msg.from?.first_name || undefined,
      content,
      timestamp: new Date(msg.date * 1000),
    }

    log.messaging.info('Telegram message received', {
      connectionId: this.connectionId,
      from: msg.chat.id,
      username: msg.from?.username,
      contentLength: content.length,
    })

    try {
      await this.events?.onMessage(incomingMessage)
    } catch (err) {
      log.messaging.error('Error processing Telegram message', {
        connectionId: this.connectionId,
        error: String(err),
      })
    }
  }

  private handleDisconnect(): void {
    this.updateStatus('disconnected')

    if (!this.isShuttingDown) {
      this.scheduleReconnect()
    }
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.bot) {
      await this.bot.stopPolling()
      this.bot = null
    }

    this.updateStatus('disconnected')
    log.messaging.info('Telegram channel shutdown', {
      connectionId: this.connectionId,
    })
  }

  async sendMessage(recipientId: string, content: string): Promise<boolean> {
    if (!this.bot || this.status !== 'connected') {
      log.messaging.warn('Cannot send Telegram message - not connected', {
        connectionId: this.connectionId,
        status: this.status,
      })
      return false
    }

    try {
      const chatId = parseInt(recipientId, 10)

      // Telegram has a 4096 character limit per message
      if (content.length <= 4096) {
        await this.bot.sendMessage(chatId, content, {
          parse_mode: 'Markdown',
          // Disable link preview to keep messages cleaner
          disable_web_page_preview: true,
        })
      } else {
        // Split message if too long
        const parts = this.splitMessage(content, 4096)
        for (const part of parts) {
          await this.bot.sendMessage(chatId, part, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
          })
          // Small delay between messages
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      }

      log.messaging.info('Telegram message sent', {
        connectionId: this.connectionId,
        to: recipientId,
        contentLength: content.length,
      })

      return true
    } catch (err) {
      log.messaging.error('Failed to send Telegram message', {
        connectionId: this.connectionId,
        to: recipientId,
        error: String(err),
      })
      return false
    }
  }

  private splitMessage(content: string, maxLength: number): string[] {
    const parts: string[] = []
    let remaining = content

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        parts.push(remaining)
        break
      }

      // Try to find a good break point
      let breakPoint = remaining.lastIndexOf('\n\n', maxLength)
      if (breakPoint === -1 || breakPoint < maxLength / 2) {
        breakPoint = remaining.lastIndexOf('\n', maxLength)
      }
      if (breakPoint === -1 || breakPoint < maxLength / 2) {
        breakPoint = remaining.lastIndexOf(' ', maxLength)
      }
      if (breakPoint === -1 || breakPoint < maxLength / 2) {
        breakPoint = maxLength
      }

      parts.push(remaining.slice(0, breakPoint))
      remaining = remaining.slice(breakPoint).trimStart()
    }

    return parts
  }

  getStatus(): ConnectionStatus {
    return this.status
  }

  // Telegram uses token-based auth, no QR code needed
  // Auth is handled via setToken method before initialize

  async logout(): Promise<void> {
    if (this.bot) {
      await this.bot.stopPolling()
      this.bot = null
    }

    this.botToken = null

    // Clear auth state in database
    db.update(messagingConnections)
      .set({
        authState: null,
        displayName: null,
        status: 'disconnected',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(messagingConnections.id, this.connectionId))
      .run()

    this.updateStatus('disconnected')
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

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isShuttingDown) return

    log.messaging.debug('Scheduling Telegram reconnect', {
      connectionId: this.connectionId,
      delayMs: 5000,
    })

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 5000)
  }
}
