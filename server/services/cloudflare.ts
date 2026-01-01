import Cloudflare from 'cloudflare'
import { generateKeyPairSync, createSign } from 'crypto'
import { mkdir, writeFile, readFile, access } from 'fs/promises'
import { join } from 'path'
import { getSettings, getViboraDir } from '../lib/settings'
import { log } from '../lib/logger'

// Permission error messages for user guidance
const ORIGIN_CA_PERMISSION_ERROR = `Your Cloudflare API token needs additional permissions to generate SSL certificates.

To fix this:
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Edit your API token
3. Add permission: Zone → SSL and Certificates → Edit
4. Save and re-deploy the app`

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
  proxied = true
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

// ============================================================================
// Origin CA Certificate Management
// ============================================================================

/**
 * Get the certificate storage directory for a domain
 */
export function getCertDir(domain: string): string {
  return join(getViboraDir(), 'certs', domain)
}

/**
 * Check if we have a valid certificate for a domain
 */
export async function hasCertificate(domain: string): Promise<boolean> {
  const certDir = getCertDir(domain)
  const certPath = join(certDir, 'cert.pem')
  const keyPath = join(certDir, 'key.pem')

  try {
    await access(certPath)
    await access(keyPath)
    return true
  } catch {
    return false
  }
}

/**
 * Get existing certificate paths for a domain
 */
export async function getCertificatePaths(
  domain: string
): Promise<{ certPath: string; keyPath: string } | null> {
  if (!(await hasCertificate(domain))) {
    return null
  }
  const certDir = getCertDir(domain)
  return {
    certPath: join(certDir, 'cert.pem'),
    keyPath: join(certDir, 'key.pem'),
  }
}

/**
 * Generate a private key and CSR for a domain
 */
function generateKeyAndCSR(hostnames: string[]): { privateKey: string; csr: string } {
  // Generate RSA key pair
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  // Build CSR manually using the primary hostname as CN
  // Cloudflare Origin CA accepts a simple CSR format
  const primaryHostname = hostnames[0]

  // Create a minimal CSR structure
  // For Cloudflare Origin CA, we can use a simplified approach
  // The CSR just needs to be valid PEM format with the subject
  const sign = createSign('SHA256')

  // Build the CSR DER structure
  const subjectDN = `CN=${primaryHostname}`
  const csrInfo = buildCSRInfo(publicKey, subjectDN)
  sign.update(csrInfo)
  const signature = sign.sign(privateKey)

  // Combine into final CSR
  const csr = buildCSR(csrInfo, signature)

  return { privateKey, csr }
}

/**
 * Build CSR certification request info (to be signed)
 */
function buildCSRInfo(publicKeyPem: string, subjectDN: string): Buffer {
  // Extract the raw public key from PEM
  const publicKeyDer = pemToDer(publicKeyPem)

  // Parse CN from subjectDN
  const cn = subjectDN.replace('CN=', '')

  // Build the subject Name sequence
  const cnOid = Buffer.from([0x55, 0x04, 0x03]) // OID 2.5.4.3 (commonName)
  const cnValue = Buffer.from(cn, 'utf8')
  const cnAttrValue = derSequence([derOid(cnOid), derPrintableString(cnValue)])
  const cnAttr = derSet([cnAttrValue])
  const subject = derSequence([cnAttr])

  // Build CertificationRequestInfo
  const version = Buffer.from([0x02, 0x01, 0x00]) // INTEGER 0
  const attributes = Buffer.from([0xa0, 0x00]) // Empty attributes [0]

  return derSequence([version, subject, publicKeyDer, attributes])
}

/**
 * Build final CSR from info and signature
 */
function buildCSR(csrInfo: Buffer, signature: Buffer): string {
  // Algorithm identifier for SHA256withRSA
  const sha256RsaOid = Buffer.from([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b, 0x05, 0x00,
  ])

  // Wrap signature in BIT STRING
  const signatureBitString = derBitString(signature)

  // Build final CSR
  const csr = derSequence([csrInfo, sha256RsaOid, signatureBitString])

  // Convert to PEM
  const base64 = csr.toString('base64')
  const lines = base64.match(/.{1,64}/g) || []
  return `-----BEGIN CERTIFICATE REQUEST-----\n${lines.join('\n')}\n-----END CERTIFICATE REQUEST-----`
}

// DER encoding helpers
function derSequence(items: Buffer[]): Buffer {
  const content = Buffer.concat(items)
  return Buffer.concat([Buffer.from([0x30]), derLength(content.length), content])
}

function derSet(items: Buffer[]): Buffer {
  const content = Buffer.concat(items)
  return Buffer.concat([Buffer.from([0x31]), derLength(content.length), content])
}

function derOid(oid: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0x06]), derLength(oid.length), oid])
}

function derPrintableString(str: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0x13]), derLength(str.length), str])
}

function derBitString(data: Buffer): Buffer {
  // BIT STRING with 0 unused bits
  const content = Buffer.concat([Buffer.from([0x00]), data])
  return Buffer.concat([Buffer.from([0x03]), derLength(content.length), content])
}

function derLength(len: number): Buffer {
  if (len < 128) {
    return Buffer.from([len])
  } else if (len < 256) {
    return Buffer.from([0x81, len])
  } else if (len < 65536) {
    return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff])
  }
  throw new Error('Length too long')
}

function pemToDer(pem: string): Buffer {
  const base64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  return Buffer.from(base64, 'base64')
}

export interface OriginCACertResult {
  success: boolean
  certPath?: string
  keyPath?: string
  error?: string
  permissionError?: boolean
}

/**
 * Create an Origin CA certificate for a domain via Cloudflare API
 * Generates a wildcard cert for *.domain and domain
 */
export async function createOriginCACertificate(domain: string): Promise<OriginCACertResult> {
  const client = getClient()
  if (!client) {
    return { success: false, error: 'Cloudflare API token not configured' }
  }

  // Check if we already have a certificate
  if (await hasCertificate(domain)) {
    const paths = await getCertificatePaths(domain)
    log.deploy.info('Using existing Origin CA certificate', { domain })
    return { success: true, certPath: paths!.certPath, keyPath: paths!.keyPath }
  }

  const hostnames = [`*.${domain}`, domain]

  try {
    log.deploy.info('Generating Origin CA certificate', { domain, hostnames })

    // Generate private key and CSR
    const { privateKey, csr } = generateKeyAndCSR(hostnames)

    // Request certificate from Cloudflare
    const cert = await client.originCACertificates.create({
      csr,
      hostnames,
      request_type: 'origin-rsa',
      requested_validity: 5475, // 15 years (maximum)
    })

    if (!cert.certificate) {
      return { success: false, error: 'Cloudflare did not return a certificate' }
    }

    // Save certificate and key
    const certDir = getCertDir(domain)
    await mkdir(certDir, { recursive: true })

    const certPath = join(certDir, 'cert.pem')
    const keyPath = join(certDir, 'key.pem')

    await writeFile(certPath, cert.certificate, 'utf-8')
    await writeFile(keyPath, privateKey, { mode: 0o600 })

    log.deploy.info('Origin CA certificate created and saved', {
      domain,
      certPath,
      expiresOn: cert.expires_on,
    })

    return { success: true, certPath, keyPath }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)

    // Check for permission errors
    if (
      errorMessage.includes('403') ||
      errorMessage.includes('forbidden') ||
      errorMessage.includes('permission') ||
      errorMessage.includes('not authorized')
    ) {
      log.deploy.error('Origin CA permission error', { domain, error: errorMessage })
      return {
        success: false,
        error: ORIGIN_CA_PERMISSION_ERROR,
        permissionError: true,
      }
    }

    log.deploy.error('Failed to create Origin CA certificate', { domain, error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

/**
 * Read existing certificate for a domain
 */
export async function readCertificate(
  domain: string
): Promise<{ cert: string; key: string } | null> {
  const paths = await getCertificatePaths(domain)
  if (!paths) return null

  try {
    const cert = await readFile(paths.certPath, 'utf-8')
    const key = await readFile(paths.keyPath, 'utf-8')
    return { cert, key }
  } catch {
    return null
  }
}
