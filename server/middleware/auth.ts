import { createMiddleware } from 'hono/factory'
import { getSignedCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import { getSettings, getSessionSecret } from '../lib/settings'

const SESSION_COOKIE_NAME = 'vibora_session'

// API paths that don't require authentication
const PUBLIC_API_PATHS = ['/health', '/api/auth/login', '/api/auth/check']

export const sessionAuthMiddleware = createMiddleware(async (c, next) => {
  const settings = getSettings()

  // If auth not configured, allow all requests
  if (!settings.basicAuthUsername || !settings.basicAuthPassword) {
    return next()
  }

  const path = c.req.path

  // Allow all non-API/non-WS routes (static assets, SPA routes) so frontend can load and show login modal
  if (!path.startsWith('/api/') && !path.startsWith('/ws/')) {
    return next()
  }

  // Allow specific public API paths
  if (PUBLIC_API_PATHS.some((p) => path === p || path.startsWith(p + '/'))) {
    return next()
  }

  // Check for valid session cookie first
  const secret = getSessionSecret()
  if (secret) {
    const sessionCookie = await getSignedCookie(c, secret, SESSION_COOKIE_NAME)
    if (sessionCookie) {
      try {
        const session = JSON.parse(sessionCookie)
        if (session.exp && session.exp > Date.now()) {
          // Valid session
          return next()
        }
      } catch {
        // Invalid session data, continue to basic auth check
      }
    }
  }

  // Check for basic auth header (CLI support)
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Basic ')) {
    const base64Credentials = authHeader.slice(6)
    try {
      const credentials = atob(base64Credentials)
      const [username, password] = credentials.split(':')

      if (username === settings.basicAuthUsername && password === settings.basicAuthPassword) {
        return next()
      }
    } catch {
      // Invalid base64, fall through to 401
    }
  }

  // No valid auth - return 401
  throw new HTTPException(401, { message: 'Unauthorized' })
})
