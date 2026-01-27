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
  getEmailStatus,
  getEmailConfig,
  configureEmail,
  testEmailCredentials,
  enableEmail,
  disableEmail,
  getStoredEmails,
  searchImapEmails,
  fetchAndStoreEmails,
  type EmailAuthState,
} from '../services/channels'
import { db, emails } from '../db'
import { eq } from 'drizzle-orm'
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

// ==================== Email Routes ====================

// GET /api/messaging/email - Get email connection status
app.get('/email', (c) => {
  const status = getEmailStatus()
  const config = getEmailConfig()
  return c.json({
    ...status,
    config,
  })
})

// POST /api/messaging/email/configure - Configure and enable email
app.post('/email/configure', async (c) => {
  try {
    const body = await c.req.json<EmailAuthState>()

    // Validate required fields
    if (!body.smtp?.host || !body.smtp?.user || !body.smtp?.password) {
      return c.json({ error: 'Missing SMTP configuration' }, 400)
    }
    if (!body.imap?.host || !body.imap?.user || !body.imap?.password) {
      return c.json({ error: 'Missing IMAP configuration' }, 400)
    }

    const conn = await configureEmail(body)
    log.messaging.info('Email configured via API')
    return c.json(conn)
  } catch (err) {
    log.messaging.error('Failed to configure email', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// POST /api/messaging/email/test - Test email credentials without saving
app.post('/email/test', async (c) => {
  try {
    const body = await c.req.json<EmailAuthState>()

    // Validate required fields
    if (!body.smtp?.host || !body.smtp?.user || !body.smtp?.password) {
      return c.json({ error: 'Missing SMTP configuration' }, 400)
    }
    if (!body.imap?.host || !body.imap?.user || !body.imap?.password) {
      return c.json({ error: 'Missing IMAP configuration' }, 400)
    }

    const result = await testEmailCredentials(body)
    return c.json(result)
  } catch (err) {
    log.messaging.error('Failed to test email credentials', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// POST /api/messaging/email/enable - Enable email using existing credentials
app.post('/email/enable', async (c) => {
  try {
    const result = await enableEmail()
    if (result.error) {
      return c.json({ error: result.error }, 400)
    }
    log.messaging.info('Email enabled via API')
    return c.json(result)
  } catch (err) {
    log.messaging.error('Failed to enable email', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// POST /api/messaging/email/disable - Disable email
app.post('/email/disable', async (c) => {
  try {
    const conn = await disableEmail()
    log.messaging.info('Email disabled via API')
    return c.json(conn)
  } catch (err) {
    log.messaging.error('Failed to disable email', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// GET /api/messaging/email/sessions - List email session mappings
app.get('/email/sessions', (c) => {
  const status = getEmailStatus()
  if (!status.enabled) {
    return c.json({ sessions: [] })
  }

  // Email sessions are tracked by the constant 'email-channel' ID
  const mappings = listSessionMappings('email-channel')
  return c.json({ sessions: mappings })
})

// GET /api/messaging/email/emails - List stored emails
app.get('/email/emails', (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50')
    const offset = parseInt(c.req.query('offset') || '0')
    const direction = c.req.query('direction') as 'incoming' | 'outgoing' | undefined
    const threadId = c.req.query('threadId')
    const search = c.req.query('search')
    const folder = c.req.query('folder')

    const result = getStoredEmails({
      limit,
      offset,
      direction,
      threadId: threadId || undefined,
      search: search || undefined,
      folder: folder || undefined,
    })

    return c.json({ emails: result, count: result.length })
  } catch (err) {
    log.messaging.error('Failed to list emails', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// GET /api/messaging/email/emails/:id - Get a specific email
app.get('/email/emails/:id', (c) => {
  try {
    const id = c.req.param('id')
    const email = db
      .select()
      .from(emails)
      .where(eq(emails.id, id))
      .get()

    if (!email) {
      return c.json({ error: 'Email not found' }, 404)
    }

    return c.json(email)
  } catch (err) {
    log.messaging.error('Failed to get email', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// POST /api/messaging/email/search - Search emails via IMAP
app.post('/email/search', async (c) => {
  try {
    const body = await c.req.json<{
      subject?: string
      from?: string
      to?: string
      since?: string
      before?: string
      text?: string
      seen?: boolean
      flagged?: boolean
      fetchLimit?: number
    }>()

    // Search IMAP
    const uids = await searchImapEmails({
      subject: body.subject,
      from: body.from,
      to: body.to,
      since: body.since ? new Date(body.since) : undefined,
      before: body.before ? new Date(body.before) : undefined,
      text: body.text,
      seen: body.seen,
      flagged: body.flagged,
    })

    // Optionally fetch and store the results
    let fetchedEmails: typeof emails.$inferSelect[] = []
    if (uids.length > 0 && body.fetchLimit !== 0) {
      fetchedEmails = await fetchAndStoreEmails(uids, { limit: body.fetchLimit || 20 })
    }

    return c.json({
      matchingUids: uids,
      matchCount: uids.length,
      fetched: fetchedEmails.length,
      emails: fetchedEmails,
    })
  } catch (err) {
    log.messaging.error('Failed to search emails', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

// POST /api/messaging/email/fetch - Fetch specific emails by UID
app.post('/email/fetch', async (c) => {
  try {
    const body = await c.req.json<{
      uids: number[]
      limit?: number
    }>()

    if (!body.uids || body.uids.length === 0) {
      return c.json({ error: 'No UIDs provided' }, 400)
    }

    const fetchedEmails = await fetchAndStoreEmails(body.uids, { limit: body.limit })

    return c.json({
      fetched: fetchedEmails.length,
      emails: fetchedEmails,
    })
  } catch (err) {
    log.messaging.error('Failed to fetch emails', { error: String(err) })
    return c.json({ error: String(err) }, 500)
  }
})

export default app
