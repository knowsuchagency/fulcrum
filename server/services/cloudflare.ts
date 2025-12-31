import { getDeploymentSettings } from '../lib/settings'
import { log } from '../lib/logger'

interface CloudflareDnsRecord {
  id: string
  name: string
  type: string
  content: string
  proxied: boolean
  ttl: number
}

interface CloudflareZone {
  id: string
  name: string
}

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'

/**
 * Get the Cloudflare API token from settings
 */
function getApiToken(): string | null {
  const settings = getDeploymentSettings()
  return settings.cloudflareApiToken
}

/**
 * Make an authenticated request to the Cloudflare API
 */
async function cloudflareRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ success: boolean; result?: T; errors?: { message: string }[] }> {
  const token = getApiToken()
  if (!token) {
    return { success: false, errors: [{ message: 'Cloudflare API token not configured' }] }
  }

  const response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const data = await response.json()
  return data as { success: boolean; result?: T; errors?: { message: string }[] }
}

/**
 * Get the zone ID for a domain
 */
export async function getZoneId(domain: string): Promise<string | null> {
  const response = await cloudflareRequest<CloudflareZone[]>(`/zones?name=${domain}`)

  if (!response.success || !response.result?.length) {
    log.deploy.error('Failed to get Cloudflare zone', { domain, errors: response.errors })
    return null
  }

  return response.result[0].id
}

/**
 * Create a DNS A record for a subdomain
 */
export async function createDnsRecord(
  subdomain: string,
  domain: string,
  ip: string,
  proxied = false
): Promise<{ success: boolean; error?: string }> {
  const zoneId = await getZoneId(domain)
  if (!zoneId) {
    return { success: false, error: `Zone not found for domain: ${domain}` }
  }

  const fullName = subdomain ? `${subdomain}.${domain}` : domain

  // Check if record already exists
  const existingResponse = await cloudflareRequest<CloudflareDnsRecord[]>(
    `/zones/${zoneId}/dns_records?type=A&name=${fullName}`
  )

  if (existingResponse.success && existingResponse.result?.length) {
    // Update existing record
    const recordId = existingResponse.result[0].id
    const updateResponse = await cloudflareRequest<CloudflareDnsRecord>(
      `/zones/${zoneId}/dns_records/${recordId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          type: 'A',
          name: fullName,
          content: ip,
          proxied,
          ttl: proxied ? 1 : 300, // Auto for proxied, 5 min otherwise
        }),
      }
    )

    if (!updateResponse.success) {
      log.deploy.error('Failed to update DNS record', { fullName, errors: updateResponse.errors })
      return { success: false, error: updateResponse.errors?.[0]?.message || 'Failed to update DNS record' }
    }

    log.deploy.info('Updated DNS record', { fullName, ip })
    return { success: true }
  }

  // Create new record
  const createResponse = await cloudflareRequest<CloudflareDnsRecord>(
    `/zones/${zoneId}/dns_records`,
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'A',
        name: fullName,
        content: ip,
        proxied,
        ttl: proxied ? 1 : 300,
      }),
    }
  )

  if (!createResponse.success) {
    log.deploy.error('Failed to create DNS record', { fullName, errors: createResponse.errors })
    return { success: false, error: createResponse.errors?.[0]?.message || 'Failed to create DNS record' }
  }

  log.deploy.info('Created DNS record', { fullName, ip })
  return { success: true }
}

/**
 * Delete a DNS record for a subdomain
 */
export async function deleteDnsRecord(
  subdomain: string,
  domain: string
): Promise<{ success: boolean; error?: string }> {
  const zoneId = await getZoneId(domain)
  if (!zoneId) {
    return { success: false, error: `Zone not found for domain: ${domain}` }
  }

  const fullName = subdomain ? `${subdomain}.${domain}` : domain

  // Find the record
  const response = await cloudflareRequest<CloudflareDnsRecord[]>(
    `/zones/${zoneId}/dns_records?type=A&name=${fullName}`
  )

  if (!response.success || !response.result?.length) {
    log.deploy.warn('DNS record not found for deletion', { fullName })
    return { success: true } // Already doesn't exist
  }

  // Delete the record
  const recordId = response.result[0].id
  const deleteResponse = await cloudflareRequest(
    `/zones/${zoneId}/dns_records/${recordId}`,
    { method: 'DELETE' }
  )

  if (!deleteResponse.success) {
    log.deploy.error('Failed to delete DNS record', { fullName, errors: deleteResponse.errors })
    return { success: false, error: deleteResponse.errors?.[0]?.message || 'Failed to delete DNS record' }
  }

  log.deploy.info('Deleted DNS record', { fullName })
  return { success: true }
}

/**
 * Verify the Cloudflare API token is valid
 */
export async function verifyToken(): Promise<{ valid: boolean; error?: string }> {
  const response = await cloudflareRequest<{ id: string }>('/user/tokens/verify')

  if (!response.success) {
    return { valid: false, error: response.errors?.[0]?.message || 'Invalid token' }
  }

  return { valid: true }
}

/**
 * List available zones for the configured token
 */
export async function listZones(): Promise<{ name: string; id: string }[]> {
  const response = await cloudflareRequest<CloudflareZone[]>('/zones?per_page=50')

  if (!response.success || !response.result) {
    return []
  }

  return response.result.map((z) => ({ name: z.name, id: z.id }))
}
