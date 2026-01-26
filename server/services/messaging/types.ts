/**
 * Messaging channel types for multi-channel AI assistant integration.
 * Supports WhatsApp initially, with extensibility for Discord, Telegram, etc.
 */

// Supported messaging channel types
export type ChannelType = 'whatsapp' | 'discord' | 'telegram' | 'email'

// Connection status
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'qr_pending' | 'credentials_required'

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
  metadata?: Record<string, unknown>  // Channel-specific metadata (e.g., email threading info)
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
   * @param metadata Optional channel-specific metadata (e.g., email threading info)
   * @returns true if message was sent successfully
   */
  sendMessage(recipientId: string, content: string, metadata?: Record<string, unknown>): Promise<boolean>

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
 * Email-specific auth state stored in database (SMTP/IMAP credentials)
 */
export interface EmailAuthState {
  smtp: {
    host: string
    port: number
    secure: boolean
    user: string
    password: string
  }
  imap: {
    host: string
    port: number
    secure: boolean
    user: string
    password: string
  }
  pollIntervalSeconds: number
  /**
   * List of email addresses or domain patterns that can always interact with the assistant.
   * Supports exact matches (user@example.com) and wildcard domains (*@example.com).
   * Emails from non-allowlisted senders are only processed if they're part of a thread
   * that was initialized by an allowlisted sender CCing the assistant.
   */
  allowedSenders?: string[]
}
