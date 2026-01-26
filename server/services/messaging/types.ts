/**
 * Messaging channel types for multi-channel AI assistant integration.
 * Supports WhatsApp initially, with extensibility for Discord, Telegram, etc.
 */

// Supported messaging channel types
export type ChannelType = 'whatsapp' | 'discord' | 'telegram' | 'slack'

// Connection status
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'qr_pending'

/**
 * Incoming message from any messaging channel
 */
export interface IncomingMessage {
  channelType: ChannelType
  connectionId: string
  senderId: string      // Phone number, Discord user ID, etc.
  senderName?: string   // Display name if available
  content: string       // Message text content
  timestamp: Date
}

/**
 * Events emitted by messaging channels
 */
export interface ChannelEvents {
  onMessage: (msg: IncomingMessage) => Promise<void>
  onConnectionChange: (status: ConnectionStatus) => void
  onAuthRequired: (data: { qrDataUrl: string }) => void
  onDisplayNameChange?: (displayName: string) => void
}

/**
 * Interface for messaging channel implementations.
 * Each channel (WhatsApp, Discord, etc.) implements this interface.
 */
export interface MessagingChannel {
  /** The type of this channel */
  readonly type: ChannelType

  /** The connection ID in the database */
  readonly connectionId: string

  /**
   * Initialize the channel and start listening for messages.
   * @param events Event handlers for message/connection/auth events
   */
  initialize(events: ChannelEvents): Promise<void>

  /**
   * Gracefully shutdown the channel connection.
   */
  shutdown(): Promise<void>

  /**
   * Send a message to a recipient.
   * @param recipientId The recipient identifier (phone, user ID, etc.)
   * @param content The message content to send
   * @returns true if message was sent successfully
   */
  sendMessage(recipientId: string, content: string): Promise<boolean>

  /**
   * Get the current connection status.
   */
  getStatus(): ConnectionStatus

  /**
   * Request authentication (e.g., generate QR code for WhatsApp).
   * Returns a data URL of the QR code image.
   */
  requestAuth?(): Promise<{ qrDataUrl: string }>

  /**
   * Disconnect and clear authentication state.
   */
  logout?(): Promise<void>
}

/**
 * WhatsApp-specific auth state stored in database
 */
export interface WhatsAppAuthState {
  creds: unknown
  keys: unknown
}

/**
 * Discord-specific auth state stored in database
 */
export interface DiscordAuthState {
  botToken: string
}

/**
 * Telegram-specific auth state stored in database
 */
export interface TelegramAuthState {
  botToken: string
}

/**
 * Slack-specific auth state stored in database
 */
export interface SlackAuthState {
  botToken: string      // xoxb-... token for Web API
  appToken: string      // xapp-... token for Socket Mode
}
