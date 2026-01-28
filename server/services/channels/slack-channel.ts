/**
 * Slack channel implementation using @slack/bolt library.
 * Uses Socket Mode for real-time messaging without needing a public URL.
 */

import { App, LogLevel, type SlashCommand, type RespondFn } from '@slack/bolt'
import type { KnownBlock, ChatPostMessageArguments } from '@slack/web-api'
import { eq } from 'drizzle-orm'
import { db, messagingConnections } from '../../db'
import { log } from '../../lib/logger'
import type {
  MessagingChannel,
  ChannelEvents,
  ConnectionStatus,
  IncomingMessage,
  SlackAuthState,
} from './types'

export class SlackChannel implements MessagingChannel {
  readonly type = 'slack' as const
  readonly connectionId: string

  private app: App | null = null
  private events: ChannelEvents | null = null
  private status: ConnectionStatus = 'disconnected'
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private isShuttingDown = false
  private botToken: string | null = null
  private appToken: string | null = null

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
      log.messaging.warn('Slack channel has no auth state', {
        connectionId: this.connectionId,
      })
      this.updateStatus('disconnected')
      return
    }

    try {
      const authState = JSON.parse(connection.authState) as SlackAuthState
      this.botToken = authState.botToken
      this.appToken = authState.appToken
    } catch (err) {
      log.messaging.error('Failed to parse Slack auth state', {
        connectionId: this.connectionId,
        error: String(err),
      })
      this.updateStatus('disconnected')
      return
    }

    await this.connect()
  }

  private async connect(): Promise<void> {
    if (this.isShuttingDown || !this.botToken || !this.appToken) return

    try {
      this.updateStatus('connecting')

      // Create Slack app with Socket Mode
      this.app = new App({
        token: this.botToken,
        appToken: this.appToken,
        socketMode: true,
        logLevel: LogLevel.WARN,
      })

      // Handle slash commands (must register before starting)
      this.app.command(/.*/, async ({ ack, command, respond }) => {
        await ack() // Must acknowledge immediately
        await this.handleSlashCommand(command, respond)
      })

      // Handle DM messages only
      // Note: app.message() handles all message events including DMs
      // We filter to only process direct messages (im channel type)
      this.app.message(async ({ message }) => {
        // Only process DMs, ignore channel/group messages
        if ((message as Record<string, unknown>).channel_type === 'im') {
          await this.handleMessage(message)
        }
      })

      // Start the app
      await this.app.start()

      // Get bot info
      const authTest = await this.app.client.auth.test()

      log.messaging.info('Slack bot connected', {
        connectionId: this.connectionId,
        botId: authTest.bot_id,
        userId: authTest.user_id,
      })
      this.updateStatus('connected')

      // Store display name (bot name or workspace)
      const displayName = (authTest.user as string) || 'Slack Bot'
      db.update(messagingConnections)
        .set({
          displayName,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(messagingConnections.id, this.connectionId))
        .run()
      this.events?.onDisplayNameChange?.(displayName)
    } catch (err) {
      log.messaging.error('Slack connect error', {
        connectionId: this.connectionId,
        error: String(err),
      })
      this.updateStatus('disconnected')
      this.scheduleReconnect()
    }
  }

  private async handleMessage(message: Record<string, unknown>): Promise<void> {
    // Ignore bot messages (including self)
    if (message.bot_id || message.subtype === 'bot_message') return

    // Only process text messages
    const content = message.text as string | undefined
    if (!content) return

    const userId = message.user as string
    if (!userId) return

    // Get user info for display name
    let senderName: string | undefined
    try {
      if (this.app) {
        const userInfo = await this.app.client.users.info({ user: userId })
        senderName = userInfo.user?.real_name || userInfo.user?.name
      }
    } catch {
      // Ignore errors getting user info
    }

    const incomingMessage: IncomingMessage = {
      channelType: 'slack',
      connectionId: this.connectionId,
      senderId: userId,
      senderName,
      content,
      timestamp: new Date(parseFloat(message.ts as string) * 1000),
    }

    log.messaging.info('Slack message received', {
      connectionId: this.connectionId,
      from: userId,
      contentLength: content.length,
    })

    try {
      await this.events?.onMessage(incomingMessage)
    } catch (err) {
      log.messaging.error('Error processing Slack message', {
        connectionId: this.connectionId,
        error: String(err),
      })
    }
  }

  /**
   * Handle slash command interactions.
   * Commands are routed to the message handler and acknowledged with an ephemeral response.
   */
  private async handleSlashCommand(
    command: SlashCommand,
    respond: RespondFn
  ): Promise<void> {
    log.messaging.info('Slack slash command received', {
      connectionId: this.connectionId,
      command: command.command,
      userId: command.user_id,
      userName: command.user_name,
    })

    // Convert slash command to an IncomingMessage for the standard command handler
    const incomingMessage: IncomingMessage = {
      channelType: 'slack',
      connectionId: this.connectionId,
      senderId: command.user_id,
      senderName: command.user_name,
      content: command.command, // e.g., "/reset"
      timestamp: new Date(),
      metadata: {
        isSlashCommand: true,
      },
    }

    try {
      await this.events?.onMessage(incomingMessage)

      // Ephemeral acknowledgment to the user
      await respond({ text: '✓ Command received', response_type: 'ephemeral' })
    } catch (err) {
      log.messaging.error('Error processing Slack slash command', {
        connectionId: this.connectionId,
        command: command.command,
        error: String(err),
      })
      await respond({
        text: 'Sorry, something went wrong processing your command.',
        response_type: 'ephemeral',
      })
    }
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.app) {
      await this.app.stop()
      this.app = null
    }

    this.updateStatus('disconnected')
    log.messaging.info('Slack channel shutdown', {
      connectionId: this.connectionId,
    })
  }

  async sendMessage(
    recipientId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<boolean> {
    if (!this.app || this.status !== 'connected') {
      log.messaging.warn('Cannot send Slack message - not connected', {
        connectionId: this.connectionId,
        status: this.status,
      })
      return false
    }

    try {
      // Open or get existing DM channel with user
      const conversation = await this.app.client.conversations.open({
        users: recipientId,
      })

      const channelId = conversation.channel?.id
      if (!channelId) {
        throw new Error('Failed to open DM channel')
      }

      // Slack has a ~40000 character limit but best practice is to keep it shorter
      // We'll use 4000 as a practical limit
      if (content.length <= 4000) {
        const messageOptions: ChatPostMessageArguments = {
          channel: channelId,
          text: content, // Fallback for notifications
        }

        // Use blocks if provided, otherwise use mrkdwn text
        if (metadata?.blocks) {
          messageOptions.blocks = metadata.blocks as KnownBlock[]
        } else {
          messageOptions.mrkdwn = true
        }

        await this.app.client.chat.postMessage(messageOptions)
      } else {
        // Split message if too long (blocks not supported for split messages)
        const parts = this.splitMessage(content, 4000)
        for (const part of parts) {
          await this.app.client.chat.postMessage({
            channel: channelId,
            text: part,
            mrkdwn: true,
          })
          // Small delay between messages
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      }

      log.messaging.info('Slack message sent', {
        connectionId: this.connectionId,
        to: recipientId,
        contentLength: content.length,
        hasBlocks: !!metadata?.blocks,
      })

      return true
    } catch (err) {
      log.messaging.error('Failed to send Slack message', {
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

  // Slack uses token-based auth, no QR code needed
  // Auth is handled via setTokens method before initialize

  async logout(): Promise<void> {
    if (this.app) {
      await this.app.stop()
      this.app = null
    }

    this.botToken = null
    this.appToken = null

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

    log.messaging.debug('Scheduling Slack reconnect', {
      connectionId: this.connectionId,
      delayMs: 5000,
    })

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 5000)
  }
}
