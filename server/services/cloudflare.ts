import Cloudflare from 'cloudflare'
import { getSettings } from '../lib/settings'
import { log } from '../lib/logger'

/**
 * Get a Cloudflare client instance
 */
function getClient(): Cloudflare | null {
  const settings = getSettings()
  if (!settings.integrations.cloudflareApiToken) return null
  return new Cloudflare({ apiToken: settings.integrations.cloudflareApiToken })
}

/**
 * Get the zone ID for a domain
 */
export async function getZoneId(domain: string): Promise<string | null> {
  const client = getClient()
  if (!client) return null

  try {
    const zones = await client.zones.list({ name: domain })
    const zone = zones.result?.[0]
    if (!zone) {
      log.deploy.error('Zone not found', { domain })
      return null
    }
    return zone.id
  } catch (err) {
    log.deploy.error('Failed to get Cloudflare zone', { domain, error: String(err) })
    return null
  }
}

/**
 * Check if a wildcard A record exists pointing to the target IP
 */
export async function checkWildcardRecord(
  domain: string,
  targetIp: string
): Promise<{ exists: boolean; matchesIp: boolean; currentIp?: string }> {
  const client = getClient()
  if (!client) return { exists: false, matchesIp: false }

  try {
    const zoneId = await getZoneId(domain)
    if (!zoneId) return { exists: false, matchesIp: false }

    const wildcardName = `*.${domain}`
    const records = await client.dns.records.list({
      zone_id: zoneId,
      type: 'A',
      name: wildcardName,
    })

    const wildcard = records.result?.[0]
    if (!wildcard || wildcard.type !== 'A') {
      return { exists: false, matchesIp: false }
    }

    return {
      exists: true,
      matchesIp: wildcard.content === targetIp,
      currentIp: wildcard.content,
    }
  } catch (err) {
    log.deploy.error('Failed to check wildcard record', { domain, error: String(err) })
    return { exists: false, matchesIp: false }
  }
}

/**
 * Create a DNS A record for a subdomain
 * Returns skipped: true if a wildcard record already handles this subdomain
 */
export async function createDnsRecord(
  subdomain: string,
  domain: string,
  ip: string,
  proxied = false
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  const client = getClient()
  if (!client) {
    return { success: false, error: 'Cloudflare API token not configured' }
  }

  try {
    // Check for wildcard first
    const wildcard = await checkWildcardRecord(domain, ip)
    if (wildcard.exists && wildcard.matchesIp) {
      log.deploy.info('Wildcard record exists, skipping subdomain creation', {
        domain,
        subdomain,
        wildcardIp: wildcard.currentIp,
      })
      return { success: true, skipped: true }
    }

    const zoneId = await getZoneId(domain)
    if (!zoneId) {
      return { success: false, error: `Zone not found for domain: ${domain}` }
    }

    const fullName = subdomain ? `${subdomain}.${domain}` : domain
    const ttl = proxied ? 1 : 300 // Auto for proxied, 5 min otherwise

    // Check if record already exists
    const existing = await client.dns.records.list({
      zone_id: zoneId,
      type: 'A',
      name: fullName,
    })

    if (existing.result?.length) {
      // Update existing record
      const recordId = existing.result[0].id
      await client.dns.records.update(recordId, {
        zone_id: zoneId,
        type: 'A',
        name: fullName,
        content: ip,
        proxied,
        ttl,
      })
      log.deploy.info('Updated DNS record', { fullName, ip })
    } else {
      // Create new record
      await client.dns.records.create({
        zone_id: zoneId,
        type: 'A',
        name: fullName,
        content: ip,
        proxied,
        ttl,
      })
      log.deploy.info('Created DNS record', { fullName, ip })
    }

    return { success: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log.deploy.error('Failed to create DNS record', { subdomain, domain, error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

/**
 * Delete a DNS record for a subdomain
 */
export async function deleteDnsRecord(
  subdomain: string,
  domain: string
): Promise<{ success: boolean; error?: string }> {
  const client = getClient()
  if (!client) {
    return { success: false, error: 'Cloudflare API token not configured' }
  }

  try {
    const zoneId = await getZoneId(domain)
    if (!zoneId) {
      return { success: false, error: `Zone not found for domain: ${domain}` }
    }

    const fullName = subdomain ? `${subdomain}.${domain}` : domain

    // Find the record
    const records = await client.dns.records.list({
      zone_id: zoneId,
      type: 'A',
      name: fullName,
    })

    if (!records.result?.length) {
      log.deploy.warn('DNS record not found for deletion', { fullName })
      return { success: true } // Already doesn't exist
    }

    // Delete the record
    const recordId = records.result[0].id
    await client.dns.records.delete(recordId, { zone_id: zoneId })
    log.deploy.info('Deleted DNS record', { fullName })
    return { success: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log.deploy.error('Failed to delete DNS record', { subdomain, domain, error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

/**
 * Verify the Cloudflare API token is valid
 */
export async function verifyToken(): Promise<{ valid: boolean; error?: string }> {
  const client = getClient()
  if (!client) {
    return { valid: false, error: 'Cloudflare API token not configured' }
  }

  try {
    await client.user.tokens.verify()
    return { valid: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return { valid: false, error: errorMessage }
  }
}

/**
 * List available zones for the configured token
 */
export async function listZones(): Promise<{ name: string; id: string }[]> {
  const client = getClient()
  if (!client) return []

  try {
    const zones = await client.zones.list({ per_page: 50 })
    return zones.result?.map((z) => ({ name: z.name, id: z.id })) ?? []
  } catch (err) {
    log.deploy.error('Failed to list zones', { error: String(err) })
    return []
  }
}
