/**
 * WhatsApp API - Functions for managing WhatsApp channel configuration and state.
 * WhatsApp uses database-stored QR auth, unlike other channels which use settings.json.
 */

import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { db, messagingConnections } from '../../../db'
import type { MessagingConnection } from '../../../db/schema'
import { activeChannels, startChannel, stopChannel } from '../channel-manager'
import { WhatsAppChannel } from '../whatsapp-channel'

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
 * Send a WhatsApp message directly.
 * Used by the assistant scheduler for proactive messaging.
 */
export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  // Find the WhatsApp channel by type (channels are stored by connection ID)
  const channel = Array.from(activeChannels.values()).find(
    (ch) => ch.type === 'whatsapp'
  ) as WhatsAppChannel | undefined
  if (!channel) {
    throw new Error('WhatsApp channel not configured or not connected')
  }

  const success = await channel.sendMessage(to, body)
  if (!success) {
    throw new Error('Failed to send WhatsApp message')
  }
}
