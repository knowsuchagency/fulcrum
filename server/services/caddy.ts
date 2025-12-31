import { getDeploymentSettings } from '../lib/settings'
import { log } from '../lib/logger'

interface CaddyRoute {
  match: { host: string[] }[]
  handle: { handler: string; upstreams?: { dial: string }[] }[]
  terminal?: boolean
}

interface CaddyServer {
  listen: string[]
  routes: CaddyRoute[]
}

interface CaddyConfig {
  apps?: {
    http?: {
      servers?: Record<string, CaddyServer>
    }
  }
}

/**
 * Get the Caddy API URL from settings
 */
function getApiUrl(): string {
  const settings = getDeploymentSettings()
  return settings.caddyApiUrl
}

/**
 * Make a request to the Caddy Admin API
 */
async function caddyRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  const apiUrl = getApiUrl()

  try {
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const text = await response.text()
      return { success: false, error: text || `HTTP ${response.status}` }
    }

    // Some endpoints return empty body
    const text = await response.text()
    if (!text) {
      return { success: true }
    }

    return { success: true, data: JSON.parse(text) as T }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * Get the current Caddy configuration
 */
export async function getConfig(): Promise<CaddyConfig | null> {
  const response = await caddyRequest<CaddyConfig>('/config/')

  if (!response.success) {
    log.deploy.error('Failed to get Caddy config', { error: response.error })
    return null
  }

  return response.data ?? null
}

/**
 * Add a reverse proxy route for a hostname
 * Routes traffic from hostname:443 to localhost:upstreamPort
 */
export async function addRoute(
  hostname: string,
  upstreamPort: number
): Promise<{ success: boolean; error?: string }> {
  const config = await getConfig()

  if (!config) {
    return { success: false, error: 'Could not get Caddy config' }
  }

  // Ensure config structure exists
  if (!config.apps) config.apps = {}
  if (!config.apps.http) config.apps.http = {}
  if (!config.apps.http.servers) config.apps.http.servers = {}

  // Get or create the main HTTPS server
  let server = config.apps.http.servers['srv0']
  if (!server) {
    server = {
      listen: [':443'],
      routes: [],
    }
    config.apps.http.servers['srv0'] = server
  }

  // Check if route already exists
  const existingRouteIndex = server.routes.findIndex(
    (r) => r.match?.[0]?.host?.includes(hostname)
  )

  const newRoute: CaddyRoute = {
    match: [{ host: [hostname] }],
    handle: [
      {
        handler: 'reverse_proxy',
        upstreams: [{ dial: `localhost:${upstreamPort}` }],
      },
    ],
    terminal: true,
  }

  if (existingRouteIndex >= 0) {
    // Update existing route
    server.routes[existingRouteIndex] = newRoute
    log.deploy.info('Updating Caddy route', { hostname, upstreamPort })
  } else {
    // Add new route at the beginning (higher priority)
    server.routes.unshift(newRoute)
    log.deploy.info('Adding Caddy route', { hostname, upstreamPort })
  }

  // Apply the updated config
  const response = await caddyRequest('/config/', {
    method: 'POST',
    body: JSON.stringify(config),
  })

  if (!response.success) {
    log.deploy.error('Failed to add Caddy route', { hostname, error: response.error })
    return { success: false, error: response.error }
  }

  log.deploy.info('Caddy route configured', { hostname, upstreamPort })
  return { success: true }
}

/**
 * Remove a reverse proxy route for a hostname
 */
export async function removeRoute(hostname: string): Promise<{ success: boolean; error?: string }> {
  const config = await getConfig()

  if (!config) {
    return { success: false, error: 'Could not get Caddy config' }
  }

  const server = config.apps?.http?.servers?.['srv0']
  if (!server) {
    // No server configured, nothing to remove
    return { success: true }
  }

  // Find and remove the route
  const routeIndex = server.routes.findIndex(
    (r) => r.match?.[0]?.host?.includes(hostname)
  )

  if (routeIndex < 0) {
    log.deploy.warn('Caddy route not found for removal', { hostname })
    return { success: true } // Already doesn't exist
  }

  server.routes.splice(routeIndex, 1)

  // Apply the updated config
  const response = await caddyRequest('/config/', {
    method: 'POST',
    body: JSON.stringify(config),
  })

  if (!response.success) {
    log.deploy.error('Failed to remove Caddy route', { hostname, error: response.error })
    return { success: false, error: response.error }
  }

  log.deploy.info('Removed Caddy route', { hostname })
  return { success: true }
}

/**
 * Check if Caddy Admin API is available
 */
export async function checkAvailable(): Promise<boolean> {
  const response = await caddyRequest('/config/')
  return response.success
}

/**
 * List all configured routes
 */
export async function listRoutes(): Promise<{ hostname: string; upstream: string }[]> {
  const config = await getConfig()

  if (!config) {
    return []
  }

  const routes: { hostname: string; upstream: string }[] = []
  const server = config.apps?.http?.servers?.['srv0']

  if (!server) {
    return []
  }

  for (const route of server.routes) {
    const hostname = route.match?.[0]?.host?.[0]
    const upstream = route.handle?.[0]?.upstreams?.[0]?.dial

    if (hostname && upstream) {
      routes.push({ hostname, upstream })
    }
  }

  return routes
}
