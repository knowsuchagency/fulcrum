/**
 * Messaging API routes for WhatsApp and other messaging channels.
 */

import { Hono } from 'hono'
import {
  listConnections,
  getWhatsAppStatus,
  enableWhatsApp,
  disableWhatsApp,
  requestWhatsAppAuth,
  disconnectWhatsApp,
  listSessionMappings,
  // Discord
  getDiscordStatus,
  enableDiscord,
  disableDiscord,
  disconnectDiscord,
  // Telegram
  getTelegramStatus,
  enableTelegram,
  disableTelegram,
  disconnectTelegram,
  // Slack
  getSlackStatus,
  enableSlack,
  disableSlack,
  disconnectSlack,
} from '../services/messaging'
import { log } from '../lib/logger'

const app = new Hono()

// GET /api/messaging/channels - List all messaging channels
app.get('/channels', (c) => {
  const connections = listConnections()
  return c.json({ channels: connections })
})

// GET /api/messaging/whatsapp - Get WhatsApp connection status
app.get('/whatsapp', (c) => {
  const conn = getWhatsAppStatus()
  return c.json(conn || { enabled: false, status: 'disconnected' })
})

// POST /api/messaging/whatsapp/enable - Enable WhatsApp integration
app.post('/whatsapp/enable', async (c) => {
  try {
    const conn = await enableWhatsApp()
    log.messaging.info('WhatsApp enabled via API')
    return c.json(conn)
  } catch (err) {
    log.messaging.error('Failed to enable WhatsApp', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// POST /api/messaging/whatsapp/disable - Disable WhatsApp integration
app.post('/whatsapp/disable', async (c) => {
  try {
    const conn = await disableWhatsApp()
    log.messaging.info('WhatsApp disabled via API')
    return c.json(conn)
  } catch (err) {
    log.messaging.error('Failed to disable WhatsApp', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// POST /api/messaging/whatsapp/auth - Request QR code for authentication
app.post('/whatsapp/auth', async (c) => {
  try {
    const result = await requestWhatsAppAuth()
    return c.json(result)
  } catch (err) {
    log.messaging.error('Failed to request WhatsApp auth', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// POST /api/messaging/whatsapp/disconnect - Disconnect and clear auth
app.post('/whatsapp/disconnect', async (c) => {
  try {
    const conn = await disconnectWhatsApp()
    log.messaging.info('WhatsApp disconnected via API')
    return c.json(conn)
  } catch (err) {
    log.messaging.error('Failed to disconnect WhatsApp', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// GET /api/messaging/whatsapp/sessions - List WhatsApp session mappings
app.get('/whatsapp/sessions', (c) => {
  const conn = getWhatsAppStatus()
  if (!conn) {
    return c.json({ sessions: [] })
  }

  const mappings = listSessionMappings(conn.id)
  return c.json({ sessions: mappings })
})

// ==================== Discord Routes ====================

// GET /api/messaging/discord - Get Discord connection status
app.get('/discord', (c) => {
  const conn = getDiscordStatus()
  return c.json(conn || { enabled: false, status: 'disconnected' })
})

// POST /api/messaging/discord/enable - Enable Discord integration with bot token
app.post('/discord/enable', async (c) => {
  try {
    const body = await c.req.json()
    const { botToken } = body

    if (!botToken || typeof botToken !== 'string') {
      return c.json({ error: 'botToken is required' }, 400)
    }

    const conn = await enableDiscord(botToken)
    log.messaging.info('Discord enabled via API')
    return c.json(conn)
  } catch (err) {
    log.messaging.error('Failed to enable Discord', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// POST /api/messaging/discord/disable - Disable Discord integration
app.post('/discord/disable', async (c) => {
  try {
    const conn = await disableDiscord()
    log.messaging.info('Discord disabled via API')
    return c.json(conn)
  } catch (err) {
    log.messaging.error('Failed to disable Discord', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// POST /api/messaging/discord/disconnect - Disconnect and clear auth
app.post('/discord/disconnect', async (c) => {
  try {
    const conn = await disconnectDiscord()
    log.messaging.info('Discord disconnected via API')
    return c.json(conn)
  } catch (err) {
    log.messaging.error('Failed to disconnect Discord', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// GET /api/messaging/discord/sessions - List Discord session mappings
app.get('/discord/sessions', (c) => {
  const conn = getDiscordStatus()
  if (!conn) {
    return c.json({ sessions: [] })
  }

  const mappings = listSessionMappings(conn.id)
  return c.json({ sessions: mappings })
})

// ==================== Telegram Routes ====================

// GET /api/messaging/telegram - Get Telegram connection status
app.get('/telegram', (c) => {
  const conn = getTelegramStatus()
  return c.json(conn || { enabled: false, status: 'disconnected' })
})

// POST /api/messaging/telegram/enable - Enable Telegram integration with bot token
app.post('/telegram/enable', async (c) => {
  try {
    const body = await c.req.json()
    const { botToken } = body

    if (!botToken || typeof botToken !== 'string') {
      return c.json({ error: 'botToken is required' }, 400)
    }

    const conn = await enableTelegram(botToken)
    log.messaging.info('Telegram enabled via API')
    return c.json(conn)
  } catch (err) {
    log.messaging.error('Failed to enable Telegram', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// POST /api/messaging/telegram/disable - Disable Telegram integration
app.post('/telegram/disable', async (c) => {
  try {
    const conn = await disableTelegram()
    log.messaging.info('Telegram disabled via API')
    return c.json(conn)
  } catch (err) {
    log.messaging.error('Failed to disable Telegram', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// POST /api/messaging/telegram/disconnect - Disconnect and clear auth
app.post('/telegram/disconnect', async (c) => {
  try {
    const conn = await disconnectTelegram()
    log.messaging.info('Telegram disconnected via API')
    return c.json(conn)
  } catch (err) {
    log.messaging.error('Failed to disconnect Telegram', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// GET /api/messaging/telegram/sessions - List Telegram session mappings
app.get('/telegram/sessions', (c) => {
  const conn = getTelegramStatus()
  if (!conn) {
    return c.json({ sessions: [] })
  }

  const mappings = listSessionMappings(conn.id)
  return c.json({ sessions: mappings })
})

// ==================== Slack Routes ====================

// GET /api/messaging/slack - Get Slack connection status
app.get('/slack', (c) => {
  const conn = getSlackStatus()
  return c.json(conn || { enabled: false, status: 'disconnected' })
})

// POST /api/messaging/slack/enable - Enable Slack integration with bot and app tokens
app.post('/slack/enable', async (c) => {
  try {
    const body = await c.req.json()
    const { botToken, appToken } = body

    if (!botToken || typeof botToken !== 'string') {
      return c.json({ error: 'botToken is required' }, 400)
    }

    if (!appToken || typeof appToken !== 'string') {
      return c.json({ error: 'appToken is required for Socket Mode' }, 400)
    }

    const conn = await enableSlack(botToken, appToken)
    log.messaging.info('Slack enabled via API')
    return c.json(conn)
  } catch (err) {
    log.messaging.error('Failed to enable Slack', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// POST /api/messaging/slack/disable - Disable Slack integration
app.post('/slack/disable', async (c) => {
  try {
    const conn = await disableSlack()
    log.messaging.info('Slack disabled via API')
    return c.json(conn)
  } catch (err) {
    log.messaging.error('Failed to disable Slack', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// POST /api/messaging/slack/disconnect - Disconnect and clear auth
app.post('/slack/disconnect', async (c) => {
  try {
    const conn = await disconnectSlack()
    log.messaging.info('Slack disconnected via API')
    return c.json(conn)
  } catch (err) {
    log.messaging.error('Failed to disconnect Slack', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// GET /api/messaging/slack/sessions - List Slack session mappings
app.get('/slack/sessions', (c) => {
  const conn = getSlackStatus()
  if (!conn) {
    return c.json({ sessions: [] })
  }

  const mappings = listSessionMappings(conn.id)
  return c.json({ sessions: mappings })
})

export default app
