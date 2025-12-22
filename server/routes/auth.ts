import { Hono } from 'hono'
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie'
import { getSettings, getSessionSecret } from '../lib/settings'

const SESSION_COOKIE_NAME = 'vibora_session'
const SESSION_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000 // 14 days

const app = new Hono()

// POST /api/auth/login - Authenticate and set session cookie
app.post('/login', async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>()
  const settings = getSettings()

  if (!settings.basicAuthUsername || !settings.basicAuthPassword) {
    return c.json({ error: 'Authentication not configured' }, 500)
  }

  if (username !== settings.basicAuthUsername || password !== settings.basicAuthPassword) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const secret = getSessionSecret()
  if (!secret) {
    return c.json({ error: 'Session secret not available' }, 500)
  }

  const expiry = Date.now() + SESSION_EXPIRY_MS
  const sessionData = JSON.stringify({ exp: expiry })

  await setSignedCookie(c, SESSION_COOKIE_NAME, sessionData, secret, {
    path: '/',
    httpOnly: true,
    sameSite: 'Strict',
    maxAge: SESSION_EXPIRY_MS / 1000,
  })

  return c.json({ success: true, expiresAt: new Date(expiry).toISOString() })
})

// POST /api/auth/logout - Clear session cookie
app.post('/logout', async (c) => {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' })
  return c.json({ success: true })
})

// GET /api/auth/check - Check if auth is required and if current session is valid
app.get('/check', async (c) => {
  const settings = getSettings()

  // If auth not configured, no auth required
  if (!settings.basicAuthUsername || !settings.basicAuthPassword) {
    return c.json({ authRequired: false, authenticated: true })
  }

  // Auth is configured, check for valid session
  const secret = getSessionSecret()
  if (!secret) {
    return c.json({ authRequired: true, authenticated: false })
  }

  const sessionCookie = await getSignedCookie(c, secret, SESSION_COOKIE_NAME)
  if (sessionCookie) {
    try {
      const session = JSON.parse(sessionCookie)
      if (session.exp && session.exp > Date.now()) {
        return c.json({ authRequired: true, authenticated: true })
      }
    } catch {
      // Invalid session data
    }
  }

  return c.json({ authRequired: true, authenticated: false })
})

export default app
