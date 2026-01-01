import Cloudflare from 'cloudflare'
import { getSettings } from '../lib/settings'
import { log } from '../lib/logger'
import { getZoneId } from './cloudflare'

// Permission error messages for user guidance
const TUNNEL_PERMISSION_ERROR = `Your Cloudflare API token needs additional permissions to manage tunnels.

To fix this:
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Edit your API token
3. Add permission: Account → Cloudflare Tunnel → Edit
4. Save and re-deploy the app`

// Types
export interface TunnelIngress {
  hostname: string
  service: string // e.g., "http://stackname_service:port"
  originRequest?: {
    noTLSVerify?: boolean
  }
}

export interface TunnelConfig {
  tunnelId: string
  tunnelName: string
  tunnelToken: string
}

/**
 * Get Cloudflare client with account ID check
 * Returns null if either API token or account ID is not configured
 */
function getClientWithAccount(): { client: Cloudflare; accountId: string } | null {
  const settings = getSettings()
  if (!settings.integrations.cloudflareApiToken || !settings.integrations.cloudflareAccountId) {
    return null
  }
  return {
    client: new Cloudflare({ apiToken: settings.integrations.cloudflareApiToken }),
    accountId: settings.integrations.cloudflareAccountId,
  }
}

/**
 * Check if tunnel support is available (both token and account ID configured)
 */
export function isTunnelAvailable(): boolean {
  const settings = getSettings()
  return !!(settings.integrations.cloudflareApiToken && settings.integrations.cloudflareAccountId)
}

/**
 * Create a new Cloudflare Tunnel
 */
export async function createTunnel(
  name: string
): Promise<{ success: boolean; tunnel?: TunnelConfig; error?: string; permissionError?: boolean }> {
  const ctx = getClientWithAccount()
  if (!ctx) {
    return { success: false, error: 'Cloudflare API token or Account ID not configured' }
  }

  try {
    // Create tunnel with cloudflare-managed config
    const tunnel = await ctx.client.zeroTrust.tunnels.cloudflared.create({
      account_id: ctx.accountId,
      name,
      config_src: 'cloudflare', // API-managed config (not local YAML)
    })

    if (!tunnel.id) {
      return { success: false, error: 'Cloudflare did not return a tunnel ID' }
    }

    // Get tunnel token for cloudflared daemon
    const tokenResult = await ctx.client.zeroTrust.tunnels.cloudflared.token.get(tunnel.id, {
      account_id: ctx.accountId,
    })

    log.deploy.info('Created Cloudflare Tunnel', { tunnelId: tunnel.id, name })

    return {
      success: true,
      tunnel: {
        tunnelId: tunnel.id,
        tunnelName: name,
        tunnelToken: tokenResult as string,
      },
    }
  } catch (err) {
    // Log the full error object for debugging
    log.deploy.error('Cloudflare Tunnel creation error details', {
      name,
      errorType: err?.constructor?.name,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
      errorCause: err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined,
      fullError: JSON.stringify(err, Object.getOwnPropertyNames(err || {})),
    })

    const errorMessage = err instanceof Error ? err.message : String(err)

    // Check for permission errors
    if (
      errorMessage.includes('403') ||
      errorMessage.includes('forbidden') ||
      errorMessage.includes('permission') ||
      errorMessage.includes('not authorized')
    ) {
      log.deploy.error('Tunnel permission error', { name, error: errorMessage })
      return {
        success: false,
        error: TUNNEL_PERMISSION_ERROR,
        permissionError: true,
      }
    }

    log.deploy.error('Failed to create Cloudflare Tunnel', { name, error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

/**
 * Configure tunnel ingress rules (hostname → service routing)
 */
export async function configureTunnelIngress(
  tunnelId: string,
  ingress: TunnelIngress[]
): Promise<{ success: boolean; error?: string }> {
  const ctx = getClientWithAccount()
  if (!ctx) {
    return { success: false, error: 'Cloudflare API token or Account ID not configured' }
  }

  try {
    // Always include catch-all rule at the end (required by Cloudflare)
    const fullIngress = [
      ...ingress,
      { hostname: '', service: 'http_status:404' }, // Catch-all for unmatched requests
    ]

    await ctx.client.zeroTrust.tunnels.cloudflared.configurations.update(tunnelId, {
      account_id: ctx.accountId,
      config: {
        ingress: fullIngress.map((rule) => ({
          hostname: rule.hostname,
          service: rule.service,
          originRequest: rule.originRequest,
        })),
      },
    })

    log.deploy.info('Configured tunnel ingress', { tunnelId, rules: ingress.length })
    return { success: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log.deploy.error('Failed to configure tunnel ingress', { tunnelId, error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

/**
 * Create DNS CNAME record pointing to tunnel
 * Tunnels use CNAME records pointing to {tunnelId}.cfargotunnel.com
 */
export async function createTunnelCname(
  subdomain: string,
  domain: string,
  tunnelId: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = getClientWithAccount()
  if (!ctx) {
    return { success: false, error: 'Cloudflare API token or Account ID not configured' }
  }

  try {
    const zoneId = await getZoneId(domain)
    if (!zoneId) {
      return { success: false, error: `Zone not found for domain: ${domain}` }
    }

    const fullName = subdomain ? `${subdomain}.${domain}` : domain
    const cnameTarget = `${tunnelId}.cfargotunnel.com`

    // Check if CNAME record already exists
    const existing = await ctx.client.dns.records.list({
      zone_id: zoneId,
      type: 'CNAME',
      name: fullName,
    })

    if (existing.result?.length) {
      // Update existing record
      const recordId = existing.result[0].id
      await ctx.client.dns.records.update(recordId, {
        zone_id: zoneId,
        type: 'CNAME',
        name: fullName,
        content: cnameTarget,
        proxied: true, // Must be proxied for tunnels
      })
      log.deploy.info('Updated tunnel CNAME', { fullName, cnameTarget })
    } else {
      // Create new record
      await ctx.client.dns.records.create({
        zone_id: zoneId,
        type: 'CNAME',
        name: fullName,
        content: cnameTarget,
        proxied: true,
      })
      log.deploy.info('Created tunnel CNAME', { fullName, cnameTarget })
    }

    return { success: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log.deploy.error('Failed to create tunnel CNAME', { subdomain, domain, error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

/**
 * Delete a Cloudflare Tunnel
 */
export async function deleteTunnel(tunnelId: string): Promise<{ success: boolean; error?: string }> {
  const ctx = getClientWithAccount()
  if (!ctx) {
    return { success: false, error: 'Cloudflare API token or Account ID not configured' }
  }

  try {
    await ctx.client.zeroTrust.tunnels.cloudflared.delete(tunnelId, {
      account_id: ctx.accountId,
    })
    log.deploy.info('Deleted Cloudflare Tunnel', { tunnelId })
    return { success: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log.deploy.error('Failed to delete tunnel', { tunnelId, error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

/**
 * Get tunnel status from Cloudflare
 */
export async function getTunnelStatus(
  tunnelId: string
): Promise<{ success: boolean; status?: string; error?: string }> {
  const ctx = getClientWithAccount()
  if (!ctx) {
    return { success: false, error: 'Cloudflare API token or Account ID not configured' }
  }

  try {
    const tunnel = await ctx.client.zeroTrust.tunnels.cloudflared.get(tunnelId, {
      account_id: ctx.accountId,
    })

    // Status can be: inactive, degraded, healthy, down
    const status = (tunnel as { status?: string }).status ?? 'unknown'
    return { success: true, status }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log.deploy.error('Failed to get tunnel status', { tunnelId, error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

/**
 * Verify Cloudflare account ID is valid by attempting to list tunnels
 */
export async function verifyAccountId(): Promise<{ valid: boolean; error?: string }> {
  const ctx = getClientWithAccount()
  if (!ctx) {
    return { valid: false, error: 'Cloudflare API token or Account ID not configured' }
  }

  try {
    // Try to list tunnels - will fail if account ID is invalid
    await ctx.client.zeroTrust.tunnels.cloudflared.list({
      account_id: ctx.accountId,
      per_page: 1,
    })
    return { valid: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return { valid: false, error: errorMessage }
  }
}

/**
 * List existing tunnels for the account
 */
export async function listTunnels(): Promise<{
  success: boolean
  tunnels?: Array<{ id: string; name: string; status: string }>
  error?: string
}> {
  const ctx = getClientWithAccount()
  if (!ctx) {
    return { success: false, error: 'Cloudflare API token or Account ID not configured' }
  }

  try {
    const result = await ctx.client.zeroTrust.tunnels.cloudflared.list({
      account_id: ctx.accountId,
      is_deleted: false,
    })

    const tunnels: Array<{ id: string; name: string; status: string }> = []
    for await (const tunnel of result) {
      tunnels.push({
        id: tunnel.id ?? '',
        name: (tunnel as { name?: string }).name ?? '',
        status: (tunnel as { status?: string }).status ?? 'unknown',
      })
    }

    return { success: true, tunnels }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log.deploy.error('Failed to list tunnels', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}
