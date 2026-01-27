/**
 * Discord channel implementation using discord.js library.
 * Handles bot connection, message sending/receiving via DMs.
 * Supports slash commands for /reset, /help, /status.
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  type Message,
  type ChatInputCommandInteraction,
} from 'discord.js'
import { eq } from 'drizzle-orm'
import { db, messagingConnections } from '../../db'
import { log } from '../../lib/logger'
import type {
  MessagingChannel,
  ChannelEvents,
  ConnectionStatus,
  IncomingMessage,
  DiscordAuthState,
} from './types'

// Slash command definitions
const SLASH_COMMANDS = [
  new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Start a fresh conversation with the AI assistant'),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available commands and how to use this bot'),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show your current session status'),
]

export class DiscordChannel implements MessagingChannel {
  readonly type = 'discord' as const
  readonly connectionId: string

  private client: Client | null = null
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
      log.messaging.warn('Discord channel has no auth state', {
        connectionId: this.connectionId,
      })
      this.updateStatus('disconnected')
      return
    }

    try {
      const authState = JSON.parse(connection.authState) as DiscordAuthState
      this.botToken = authState.botToken
    } catch (err) {
      log.messaging.error('Failed to parse Discord auth state', {
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

      // Create Discord client with required intents and partials for DMs
      // Guilds intent is needed for proper channel resolution
      // Partials.Channel is required to receive DMs (DM channels aren't cached by default)
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.DirectMessages,
          GatewayIntentBits.MessageContent,
        ],
        partials: [Partials.Channel],
      })

      // Handle ready event
      this.client.once('ready', async () => {
        log.messaging.info('Discord bot connected', {
          connectionId: this.connectionId,
          username: this.client?.user?.tag,
        })
        this.updateStatus('connected')

        // Store display name (bot username)
        if (this.client?.user) {
          const displayName = this.client.user.tag
          db.update(messagingConnections)
            .set({
              displayName,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(messagingConnections.id, this.connectionId))
            .run()
          this.events?.onDisplayNameChange?.(displayName)

          // Register slash commands
          await this.registerSlashCommands()
        }
      })

      // Handle slash command interactions
      this.client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand()) return
        if (!interaction.channel?.isDMBased()) return // Only handle DM commands

        await this.handleSlashCommand(interaction)
      })

      // Handle messages
      this.client.on('messageCreate', (message: Message) => {
        this.handleMessage(message)
      })

      // Handle disconnection
      this.client.on('error', (error) => {
        log.messaging.error('Discord client error', {
          connectionId: this.connectionId,
          error: String(error),
        })
        this.handleDisconnect()
      })

      // Login
      await this.client.login(this.botToken)
    } catch (err) {
      log.messaging.error('Discord connect error', {
        connectionId: this.connectionId,
        error: String(err),
      })
      this.updateStatus('disconnected')
      this.scheduleReconnect()
    }
  }

  private async handleMessage(message: Message): Promise<void> {
    log.messaging.debug('Discord messageCreate event', {
      connectionId: this.connectionId,
      authorId: message.author.id,
      authorBot: message.author.bot,
      channelType: message.channel.type,
      isDMBased: message.channel.isDMBased(),
      hasContent: !!message.content,
    })

    // Ignore messages from bots (including self)
    if (message.author.bot) return

    // Only process DMs (direct messages)
    if (!message.channel.isDMBased()) return

    const content = message.content
    if (!content) return

    const incomingMessage: IncomingMessage = {
      channelType: 'discord',
      connectionId: this.connectionId,
      senderId: message.author.id,
      senderName: message.author.username,
      content,
      timestamp: message.createdAt,
    }

    log.messaging.info('Discord message received', {
      connectionId: this.connectionId,
      from: message.author.id,
      username: message.author.username,
      contentLength: content.length,
    })

    try {
      await this.events?.onMessage(incomingMessage)
    } catch (err) {
      log.messaging.error('Error processing Discord message', {
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

  /**
   * Register slash commands with Discord.
   * Commands are registered globally (available in all DMs).
   */
  private async registerSlashCommands(): Promise<void> {
    if (!this.client?.user || !this.botToken) return

    try {
      const rest = new REST({ version: '10' }).setToken(this.botToken)
      const commands = SLASH_COMMANDS.map((cmd) => cmd.toJSON())

      // Register commands globally (available in DMs)
      await rest.put(Routes.applicationCommands(this.client.user.id), {
        body: commands,
      })

      log.messaging.info('Discord slash commands registered', {
        connectionId: this.connectionId,
        commands: SLASH_COMMANDS.map((c) => c.name),
      })
    } catch (err) {
      log.messaging.error('Failed to register Discord slash commands', {
        connectionId: this.connectionId,
        error: String(err),
      })
    }
  }

  /**
   * Handle slash command interactions.
   * Commands are processed and responded to directly in the interaction.
   */
  private async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const commandName = interaction.commandName

    log.messaging.info('Discord slash command received', {
      connectionId: this.connectionId,
      command: commandName,
      userId: interaction.user.id,
      username: interaction.user.username,
    })

    // Convert slash command to a message for the standard command handler
    // This allows the session mapper and other handlers to process it normally
    const incomingMessage: IncomingMessage = {
      channelType: 'discord',
      connectionId: this.connectionId,
      senderId: interaction.user.id,
      senderName: interaction.user.username,
      content: `/${commandName}`,
      timestamp: new Date(),
      metadata: {
        isSlashCommand: true,
        interactionId: interaction.id,
      },
    }

    try {
      // Process the command through the normal message handler
      // The handler will send the response via sendMessage
      await this.events?.onMessage(incomingMessage)

      // Acknowledge the interaction (ephemeral so it doesn't clutter the chat)
      await interaction.reply({
        content: `✓ Command received`,
        ephemeral: true,
      })
    } catch (err) {
      log.messaging.error('Error processing Discord slash command', {
        connectionId: this.connectionId,
        command: commandName,
        error: String(err),
      })
      await interaction.reply({
        content: 'Sorry, something went wrong processing your command.',
        ephemeral: true,
      })
    }
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.client) {
      this.client.destroy()
      this.client = null
    }

    this.updateStatus('disconnected')
    log.messaging.info('Discord channel shutdown', {
      connectionId: this.connectionId,
    })
  }

  async sendMessage(recipientId: string, content: string): Promise<boolean> {
    if (!this.client || this.status !== 'connected') {
      log.messaging.warn('Cannot send Discord message - not connected', {
        connectionId: this.connectionId,
        status: this.status,
      })
      return false
    }

    try {
      // Fetch user and send DM
      const user = await this.client.users.fetch(recipientId)

      // Discord has a 2000 character limit
      if (content.length <= 2000) {
        await user.send(content)
      } else {
        // Split message if too long
        const parts = this.splitMessage(content, 2000)
        for (const part of parts) {
          await user.send(part)
          // Small delay between messages
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      }

      log.messaging.info('Discord message sent', {
        connectionId: this.connectionId,
        to: recipientId,
        contentLength: content.length,
      })

      return true
    } catch (err) {
      log.messaging.error('Failed to send Discord message', {
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

  // Discord uses token-based auth, no QR code needed
  // Auth is handled via setToken method before initialize

  async logout(): Promise<void> {
    if (this.client) {
      this.client.destroy()
      this.client = null
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

    log.messaging.debug('Scheduling Discord reconnect', {
      connectionId: this.connectionId,
      delayMs: 5000,
    })

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 5000)
  }
}
