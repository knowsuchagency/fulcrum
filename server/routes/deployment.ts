import { Hono } from 'hono'
import {
  checkDockerInstalled,
  checkDockerRunning,
  getDockerVersion,
} from '../services/docker-compose'
import {
  detectTraefik,
  checkConfigDirWritable,
} from '../services/traefik'
import {
  getTraefikContainerStatus,
  startTraefikContainer,
  stopTraefikContainer,
  getTraefikLogs,
  TRAEFIK_CONTAINER_NAME,
  TRAEFIK_NETWORK,
  getTraefikDynamicDir,
} from '../services/traefik-docker'
import { getSettings, updateSettingByPath } from '../lib/settings'

const app = new Hono()

export interface DeploymentPrerequisites {
  docker: {
    installed: boolean
    running: boolean
    version: string | null
  }
  traefik: {
    detected: boolean
    type: 'dokploy' | 'vibora' | 'other' | 'none'
    containerName: string | null
    configDir: string | null
    network: string | null
    configWritable: boolean
  }
  settings: {
    cloudflareConfigured: boolean
  }
  ready: boolean
}

// GET /api/deployment/prerequisites - Check all deployment prerequisites
app.get('/prerequisites', async (c) => {
  // Check Docker status
  const [dockerInstalled, dockerRunning, dockerVersion] = await Promise.all([
    checkDockerInstalled(),
    checkDockerRunning(),
    getDockerVersion(),
  ])

  // Check Traefik status
  const traefikConfig = await detectTraefik()
  let configWritable = false

  if (traefikConfig) {
    configWritable = await checkConfigDirWritable(traefikConfig.configDir)
  }

  // Check settings
  const settings = getSettings()

  const prerequisites: DeploymentPrerequisites = {
    docker: {
      installed: dockerInstalled,
      running: dockerRunning,
      version: dockerVersion,
    },
    traefik: {
      detected: !!traefikConfig,
      type: traefikConfig?.type ?? 'none',
      containerName: traefikConfig?.containerName ?? null,
      configDir: traefikConfig?.configDir ?? null,
      network: traefikConfig?.network ?? null,
      configWritable,
    },
    settings: {
      cloudflareConfigured: !!settings.integrations.cloudflareApiToken,
    },
    // Ready if Docker is running (Traefik will be auto-started if needed)
    ready: dockerRunning,
  }

  return c.json(prerequisites)
})

// POST /api/deployment/traefik/start - Start Vibora's Traefik container
app.post('/traefik/start', async (c) => {
  // First check if Docker is running
  const dockerRunning = await checkDockerRunning()
  if (!dockerRunning) {
    return c.json(
      {
        success: false,
        error: 'Docker is not running. Please start Docker first.',
        code: 'DOCKER_NOT_RUNNING',
      },
      400
    )
  }

  // Check if external Traefik already exists
  const existingTraefik = await detectTraefik()
  if (existingTraefik && existingTraefik.type !== 'vibora') {
    return c.json(
      {
        success: false,
        error: `External Traefik detected (${existingTraefik.containerName}). Using existing Traefik instead.`,
        code: 'TRAEFIK_EXISTS',
        traefik: existingTraefik,
      },
      400
    )
  }

  const result = await startTraefikContainer('admin@localhost')

  if (!result.success) {
    return c.json(
      {
        success: false,
        error: result.error,
        code: 'TRAEFIK_START_FAILED',
      },
      500
    )
  }

  // Get updated status
  const status = await getTraefikContainerStatus()

  return c.json({
    success: true,
    status,
    containerName: TRAEFIK_CONTAINER_NAME,
    network: TRAEFIK_NETWORK,
    configDir: getTraefikDynamicDir(),
  })
})

// POST /api/deployment/traefik/stop - Stop Vibora's Traefik container
app.post('/traefik/stop', async (c) => {
  const result = await stopTraefikContainer()

  if (!result.success) {
    return c.json(
      {
        success: false,
        error: result.error,
      },
      500
    )
  }

  return c.json({ success: true })
})

// GET /api/deployment/traefik/logs - Get Traefik container logs
app.get('/traefik/logs', async (c) => {
  const tail = parseInt(c.req.query('tail') ?? '100', 10)
  const logs = await getTraefikLogs(tail)
  return c.json({ logs })
})

// GET /api/deployment/detect-ip - Auto-detect public IP
app.get('/detect-ip', async (c) => {
  const services = [
    'https://api.ipify.org',
    'https://icanhazip.com',
    'https://ifconfig.me/ip',
    'https://checkip.amazonaws.com',
  ]

  for (const service of services) {
    try {
      const response = await fetch(service, { signal: AbortSignal.timeout(5000) })
      if (response.ok) {
        const ip = (await response.text()).trim()
        // Basic IPv4 validation
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
          return c.json({ success: true, ip })
        }
      }
    } catch {
      // Try next service
    }
  }

  return c.json(
    {
      success: false,
      error: 'Could not detect public IP',
    },
    500
  )
})

// POST /api/deployment/settings - Update deployment settings
app.post('/settings', async (c) => {
  try {
    const body = await c.req.json<{
      cloudflareApiToken?: string | null
      cloudflareAccountId?: string | null
    }>()

    if (body.cloudflareApiToken !== undefined) {
      updateSettingByPath('integrations.cloudflareApiToken', body.cloudflareApiToken)
    }

    if (body.cloudflareAccountId !== undefined) {
      updateSettingByPath('integrations.cloudflareAccountId', body.cloudflareAccountId)
    }

    const settings = getSettings()
    const { cloudflareApiToken, cloudflareAccountId } = settings.integrations

    return c.json({
      success: true,
      settings: {
        cloudflareConfigured: !!cloudflareApiToken,
        tunnelsAvailable: !!(cloudflareApiToken && cloudflareAccountId),
      },
    })
  } catch (err) {
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update settings',
      },
      400
    )
  }
})

// GET /api/deployment/settings - Get current deployment settings
app.get('/settings', async (c) => {
  const settings = getSettings()
  const token = settings.integrations.cloudflareApiToken
  const accountId = settings.integrations.cloudflareAccountId

  return c.json({
    // Mask the token but preserve its length for consistent UI display
    cloudflareApiToken: token ? '•'.repeat(token.length) : null,
    cloudflareAccountId: accountId ? '•'.repeat(accountId.length) : null,
    cloudflareConfigured: !!token,
    tunnelsAvailable: !!(token && accountId),
  })
})

// GET /api/deployment/verify-tunnel-api - Verify tunnel API access
app.get('/verify-tunnel-api', async (c) => {
  const settings = getSettings()
  const token = settings.integrations.cloudflareApiToken
  const accountId = settings.integrations.cloudflareAccountId

  if (!token || !accountId) {
    return c.json({
      success: false,
      error: 'Cloudflare API token and Account ID must both be configured',
    })
  }

  try {
    // Use dynamic import to avoid issues if module isn't loaded
    const { verifyAccountId, listTunnels } = await import('../services/cloudflare-tunnel')

    // First verify the account ID is valid
    const verifyResult = await verifyAccountId()
    if (!verifyResult.valid) {
      return c.json({
        success: false,
        error: `Account verification failed: ${verifyResult.error}`,
        suggestion: 'Check that your Account ID is correct and your API token has "Account > Cloudflare Tunnel > Edit" permission',
      })
    }

    // Try listing tunnels to verify full access
    const listResult = await listTunnels()
    if (!listResult.success) {
      return c.json({
        success: false,
        error: `Failed to list tunnels: ${listResult.error}`,
        suggestion: 'Your API token may need "Account > Cloudflare Tunnel > Edit" permission',
      })
    }

    return c.json({
      success: true,
      message: 'Tunnel API access verified successfully',
      existingTunnels: listResult.tunnels?.length ?? 0,
    })
  } catch (err) {
    return c.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      errorType: err?.constructor?.name,
    })
  }
})

// Legacy Caddy endpoints (redirect to Traefik for backwards compatibility)
app.post('/caddy/start', async (c) => {
  return c.json(
    {
      success: false,
      error: 'Caddy is no longer used. Use /api/deployment/traefik/start instead.',
      code: 'DEPRECATED',
    },
    410
  )
})

app.post('/caddy/stop', async (c) => {
  return c.json(
    {
      success: false,
      error: 'Caddy is no longer used. Use /api/deployment/traefik/stop instead.',
      code: 'DEPRECATED',
    },
    410
  )
})

export default app
