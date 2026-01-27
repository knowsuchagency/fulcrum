/**
 * WhatsApp channel implementation using Baileys library.
 * Handles connection, QR code auth, message sending/receiving.
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState as baileysUseMultiFileAuthState,
  type WASocket,
  type BaileysEventMap,
  type ConnectionState,
} from '@whiskeysockets/baileys'
import * as QRCode from 'qrcode'
import { eq } from 'drizzle-orm'
import { join } from 'node:path'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { Boom } from '@hapi/boom'
import { db, messagingConnections } from '../../db'
import { getFulcrumDir } from '../../lib/settings'
import { log } from '../../lib/logger'
import type {
  MessagingChannel,
  ChannelEvents,
  ConnectionStatus,
  IncomingMessage,
} from './types'

export class WhatsAppChannel implements MessagingChannel {
  readonly type = 'whatsapp' as const
  readonly connectionId: string

  private socket: WASocket | null = null
  private events: ChannelEvents | null = null
  private status: ConnectionStatus = 'disconnected'
  private authDir: string
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private isShuttingDown = false

  constructor(connectionId: string) {
    this.connectionId = connectionId
    this.authDir = join(getFulcrumDir(), 'whatsapp-auth', connectionId)
  }

  async initialize(events: ChannelEvents): Promise<void> {
    this.events = events
    this.isShuttingDown = false

    // Ensure auth directory exists
    mkdirSync(this.authDir, { recursive: true })

    await this.connect()
  }

  private async connect(): Promise<void> {
    if (this.isShuttingDown) return

    try {
      this.updateStatus('connecting')

      // Use file-based auth state
      const { state, saveCreds } = await baileysUseMultiFileAuthState(this.authDir)

      // Create socket
      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false, // We handle QR display ourselves
        browser: ['Fulcrum', 'Chrome', '1.0.0'],
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
      })

      // Handle credential updates
      this.socket.ev.on('creds.update', saveCreds)

      // Handle connection updates
      this.socket.ev.on('connection.update', (update: Partial<ConnectionState>) => {
        this.handleConnectionUpdate(update)
      })

      // Handle incoming messages
      this.socket.ev.on('messages.upsert', (m: BaileysEventMap['messages.upsert']) => {
        this.handleMessages(m)
      })
    } catch (err) {
      log.messaging.error('WhatsApp connect error', {
        connectionId: this.connectionId,
        error: String(err),
      })
      this.updateStatus('disconnected')
      this.scheduleReconnect()
    }
  }

  private handleConnectionUpdate(update: Partial<ConnectionState>): void {
    const { connection, lastDisconnect, qr } = update

    log.messaging.debug('WhatsApp connection update', {
      connectionId: this.connectionId,
      connection,
      qr: qr ? 'present' : 'absent',
    })

    if (qr) {
      // Generate QR code data URL and emit
      this.updateStatus('qr_pending')
      QRCode.toDataURL(qr)
        .then((qrDataUrl) => {
          this.events?.onAuthRequired({ qrDataUrl })
        })
        .catch((err) => {
          log.messaging.error('Failed to generate QR code', {
            connectionId: this.connectionId,
            error: String(err),
          })
        })
    }

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut

      log.messaging.info('WhatsApp connection closed', {
        connectionId: this.connectionId,
        shouldReconnect,
        statusCode: (lastDisconnect?.error as Boom)?.output?.statusCode,
      })

      this.updateStatus('disconnected')

      if (shouldReconnect && !this.isShuttingDown) {
        this.scheduleReconnect()
      } else if ((lastDisconnect?.error as Boom)?.output?.statusCode === DisconnectReason.loggedOut) {
        // User logged out - clear auth state
        this.clearAuthState()
      }
    } else if (connection === 'open') {
      log.messaging.info('WhatsApp connected', {
        connectionId: this.connectionId,
      })
      this.updateStatus('connected')

      // Get and store display name (phone number)
      if (this.socket?.user) {
        const displayName = this.socket.user.id?.split(':')[0] || this.socket.user.name
        if (displayName) {
          db.update(messagingConnections)
            .set({
              displayName,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(messagingConnections.id, this.connectionId))
            .run()
          this.events?.onDisplayNameChange?.(displayName)
        }
      }
    }
  }

  private async handleMessages(m: BaileysEventMap['messages.upsert']): Promise<void> {
    if (m.type !== 'notify') return

    // Get our own JID and LID for self-chat detection
    // WhatsApp uses both phone number JID (xxx@s.whatsapp.net) and LID (xxx@lid)
    const myJid = this.socket?.user?.id
    const myLid = (this.socket?.user as { lid?: string })?.lid
    const myNumber = myJid?.split(':')[0] || myJid?.split('@')[0]
    const myLidNumber = myLid?.split(':')[0] || myLid?.split('@')[0]

    for (const msg of m.messages) {
      // Skip non-text messages
      if (!msg.message?.conversation && !msg.message?.extendedTextMessage?.text) continue

      const remoteJid = msg.key.remoteJid || ''
      const remoteNumber = remoteJid.split('@')[0]
      // Check if this is a self-chat by comparing both phone number and LID
      const isSelfChat =
        (myNumber && remoteNumber === myNumber) || (myLidNumber && remoteNumber === myLidNumber)

      // Only respond to messages in self-chat (user messaging themselves via "Message yourself")
      // Ignore: group chats, direct messages from other people
      if (!isSelfChat) continue

      const content = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
      // Keep full JID as senderId to preserve @lid vs @s.whatsapp.net for replies
      const senderId = remoteJid
      const senderName = isSelfChat ? 'You' : msg.pushName

      if (!senderId || !content) continue

      const incomingMessage: IncomingMessage = {
        channelType: 'whatsapp',
        connectionId: this.connectionId,
        senderId,
        senderName,
        content,
        timestamp: new Date(msg.messageTimestamp as number * 1000),
      }

      log.messaging.info('WhatsApp message received', {
        connectionId: this.connectionId,
        from: senderId,
        contentLength: content.length,
        isSelfChat,
      })

      try {
        await this.events?.onMessage(incomingMessage)
      } catch (err) {
        log.messaging.error('Error processing WhatsApp message', {
          connectionId: this.connectionId,
          error: String(err),
        })
      }
    }
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.socket) {
      this.socket.end(undefined)
      this.socket = null
    }

    this.updateStatus('disconnected')
    log.messaging.info('WhatsApp channel shutdown', {
      connectionId: this.connectionId,
    })
  }

  async sendMessage(recipientId: string, content: string): Promise<boolean> {
    if (!this.socket || this.status !== 'connected') {
      log.messaging.warn('Cannot send WhatsApp message - not connected', {
        connectionId: this.connectionId,
        status: this.status,
      })
      return false
    }

    try {
      // Format recipient as WhatsApp JID
      const jid = recipientId.includes('@') ? recipientId : `${recipientId}@s.whatsapp.net`

      await this.socket.sendMessage(jid, { text: content })

      log.messaging.info('WhatsApp message sent', {
        connectionId: this.connectionId,
        to: recipientId,
        contentLength: content.length,
      })

      return true
    } catch (err) {
      log.messaging.error('Failed to send WhatsApp message', {
        connectionId: this.connectionId,
        to: recipientId,
        error: String(err),
      })
      return false
    }
  }

  getStatus(): ConnectionStatus {
    return this.status
  }

  async requestAuth(): Promise<{ qrDataUrl: string }> {
    // Clear existing auth state and reconnect to get fresh QR
    await this.clearAuthState()

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('QR code generation timeout'))
      }, 30000)

      const originalOnAuthRequired = this.events?.onAuthRequired
      this.events = {
        ...this.events!,
        onAuthRequired: (data) => {
          clearTimeout(timeout)
          // Restore original handler
          if (this.events) {
            this.events.onAuthRequired = originalOnAuthRequired!
          }
          resolve(data)
        },
      }

      this.connect()
    })
  }

  async logout(): Promise<void> {
    if (this.socket) {
      try {
        await this.socket.logout()
      } catch (err) {
        log.messaging.warn('Error during WhatsApp logout', {
          connectionId: this.connectionId,
          error: String(err),
        })
      }
    }

    await this.clearAuthState()
  }

  private async clearAuthState(): Promise<void> {
    // Disconnect socket
    if (this.socket) {
      this.socket.end(undefined)
      this.socket = null
    }

    // Remove auth directory
    if (existsSync(this.authDir)) {
      rmSync(this.authDir, { recursive: true, force: true })
    }

    // Update database
    db.update(messagingConnections)
      .set({
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

    log.messaging.debug('Scheduling WhatsApp reconnect', {
      connectionId: this.connectionId,
      delayMs: 5000,
    })

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 5000)
  }
}
