import { writeFile, unlink, access, constants, readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { stringify as stringifyYaml } from 'yaml'
import { log } from '../lib/logger'
import { runDocker } from './docker-compose'

export interface TraefikConfig {
  configDir: string // e.g., /etc/dokploy/traefik/dynamic
  network: string // e.g., dokploy-network
  certResolver: string // e.g., letsencrypt
  containerName: string // e.g., dokploy-traefik
  type: 'dokploy' | 'fulcrum' | 'other'
  certsDir?: string // e.g., /certs (mount point inside container)
}

interface DockerContainer {
  Id: string
  Names: string[]
  Image: string
  Mounts: Array<{
    Type: string
    Source: string
    Destination: string
  }>
  NetworkSettings: {
    Networks: Record<string, { NetworkID: string }>
  }
}

/**
 * Detect existing Traefik installation
 * Checks for dokploy-traefik first, then any container with traefik image
 */
export async function detectTraefik(): Promise<TraefikConfig | null> {
  try {
    // First check for dokploy-traefik (most common case)
    const dokployResult = await runDocker([
      'inspect',
      'dokploy-traefik',
      '--format',
      '{{json .}}',
    ])

    if (dokployResult.exitCode === 0) {
      const container = JSON.parse(dokployResult.stdout) as DockerContainer
      return parseTraefikContainer(container, 'dokploy')
    }

    // Check for fulcrum-traefik
    const fulcrumResult = await runDocker([
      'inspect',
      'fulcrum-traefik',
      '--format',
      '{{json .}}',
    ])

    if (fulcrumResult.exitCode === 0) {
      const container = JSON.parse(fulcrumResult.stdout) as DockerContainer
      return parseTraefikContainer(container, 'fulcrum')
    }

    // Search for any running traefik container
    const searchResult = await runDocker([
      'ps',
      '--filter',
      'ancestor=traefik',
      '--format',
      '{{.Names}}',
    ])

    if (searchResult.exitCode === 0 && searchResult.stdout.trim()) {
      const containerName = searchResult.stdout.trim().split('\n')[0]
      const inspectResult = await runDocker([
        'inspect',
        containerName,
        '--format',
        '{{json .}}',
      ])

      if (inspectResult.exitCode === 0) {
        const container = JSON.parse(inspectResult.stdout) as DockerContainer
        return parseTraefikContainer(container, 'other')
      }
    }

    // Also check for traefik:v2 and traefik:v3 images
    for (const image of ['traefik:v3', 'traefik:v2', 'traefik:latest']) {
      const result = await runDocker([
        'ps',
        '--filter',
        `ancestor=${image}`,
        '--format',
        '{{.Names}}',
      ])

      if (result.exitCode === 0 && result.stdout.trim()) {
        const containerName = result.stdout.trim().split('\n')[0]
        const inspectResult = await runDocker([
          'inspect',
          containerName,
          '--format',
          '{{json .}}',
        ])

        if (inspectResult.exitCode === 0) {
          const container = JSON.parse(inspectResult.stdout) as DockerContainer
          return parseTraefikContainer(container, 'other')
        }
      }
    }

    log.deploy.debug('No Traefik installation detected')
    return null
  } catch (err) {
    log.deploy.error('Error detecting Traefik', { error: String(err) })
    return null
  }
}

/**
 * Parse Traefik container info to extract config
 */
function parseTraefikContainer(
  container: DockerContainer,
  type: 'dokploy' | 'fulcrum' | 'other'
): TraefikConfig | null {
  // Find the dynamic config directory mount
  const dynamicMount = container.Mounts?.find(
    (m) =>
      m.Destination.includes('dynamic') ||
      m.Destination.includes('/etc/traefik') ||
      m.Destination.includes('/etc/dokploy/traefik')
  )

  // For Dokploy, the config dir is /etc/dokploy/traefik/dynamic
  let configDir: string
  if (type === 'dokploy') {
    configDir = '/etc/dokploy/traefik/dynamic'
  } else if (dynamicMount) {
    // Use the source path if it contains 'dynamic', otherwise append it
    configDir = dynamicMount.Source.includes('dynamic')
      ? dynamicMount.Source
      : join(dynamicMount.Source, 'dynamic')
  } else {
    // Default fallback - use /etc/traefik/dynamic for external Traefik
    // (Fulcrum's own Traefik uses getFulcrumTraefikConfig() which resolves dynamically)
    configDir = '/etc/traefik/dynamic'
  }

  // Find the network - prefer dokploy-network, then any network
  const networks = Object.keys(container.NetworkSettings?.Networks || {})
  const network =
    networks.find((n) => n === 'dokploy-network') ||
    networks.find((n) => n === 'fulcrum-network') ||
    networks.find((n) => !n.includes('bridge') && !n.includes('host')) ||
    'dokploy-network'

  const containerName =
    container.Names?.[0]?.replace(/^\//, '') || (type === 'dokploy' ? 'dokploy-traefik' : 'traefik')

  log.deploy.info('Detected Traefik installation', {
    type,
    containerName,
    configDir,
    network,
  })

  return {
    configDir,
    network,
    certResolver: 'letsencrypt', // Standard name used by Dokploy
    containerName,
    type,
  }
}

/**
 * Check if config directory is writable
 */
export async function checkConfigDirWritable(configDir: string): Promise<boolean> {
  try {
    await access(configDir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Generate Traefik config filename for an app
 * Format: fulcrum-{appName}-{appId}.yml for human readability
 */
function getConfigFilename(appId: string, appName?: string): string {
  if (appName) {
    // Sanitize app name for filesystem: lowercase, replace spaces/special chars with hyphens
    const sanitized = appName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    return `fulcrum-${sanitized}-${appId}.yml`
  }
  return `fulcrum-${appId}.yml`
}

/**
 * Check for conflicting routes in other Fulcrum config files
 * Returns the conflicting app ID if found, null otherwise
 */
async function checkRouteConflict(
  configDir: string,
  domain: string,
  currentAppId: string
): Promise<{ conflictingAppId: string; conflictingFile: string } | null> {
  try {
    const files = await readdir(configDir)
    const fulcrumFiles = files.filter(
      (f) => f.startsWith('fulcrum-') && f.endsWith('.yml') && f !== getConfigFilename(currentAppId)
    )

    for (const file of fulcrumFiles) {
      const filepath = join(configDir, file)
      const content = await readFile(filepath, 'utf-8')

      // Check if this file routes to the same domain
      // Look for Host(`domain`) pattern
      if (content.includes(`Host(\`${domain}\`)`)) {
        // Extract app ID from filename: fulcrum-{appId}.yml
        const match = file.match(/^fulcrum-(.+)\.yml$/)
        const conflictingAppId = match ? match[1] : 'unknown'
        return { conflictingAppId, conflictingFile: filepath }
      }
    }

    return null
  } catch (err) {
    // If we can't read the directory, log and continue (don't block deployment)
    log.deploy.warn('Failed to check for route conflicts', {
      configDir,
      domain,
      error: String(err),
    })
    return null
  }
}

export interface AddRouteOptions {
  /** Use file-based TLS certificate instead of ACME resolver */
  tlsCert?: {
    /** Path to cert file inside container (e.g., /certs/example.com/cert.pem) */
    certFile: string
    /** Path to key file inside container (e.g., /certs/example.com/key.pem) */
    keyFile: string
  }
  /** App name for human-readable config filename */
  appName?: string
}

/**
 * Add a Traefik route for an app service
 */
export async function addRoute(
  config: TraefikConfig,
  appId: string,
  domain: string,
  upstreamUrl: string,
  options?: AddRouteOptions
): Promise<{ success: boolean; error?: string }> {
  // Check for conflicting routes from other apps
  const conflict = await checkRouteConflict(config.configDir, domain, appId)
  if (conflict) {
    const error = `Route conflict: domain "${domain}" is already routed by app ${conflict.conflictingAppId}. Delete the conflicting app or remove its Traefik config at ${conflict.conflictingFile}`
    log.deploy.error('Route conflict detected', {
      appId,
      domain,
      conflictingAppId: conflict.conflictingAppId,
      conflictingFile: conflict.conflictingFile,
    })
    return { success: false, error }
  }

  const routerId = `fulcrum-${appId}`
  const filename = getConfigFilename(appId, options?.appName)
  const filepath = join(config.configDir, filename)

  // Build TLS config - use file cert if provided, otherwise use ACME resolver
  let tlsConfig: Record<string, unknown>
  let tlsStores: Record<string, unknown> | undefined

  if (options?.tlsCert) {
    // Use file-based certificate
    tlsConfig = {} // Empty - will use default store
    tlsStores = {
      default: {
        defaultCertificate: {
          certFile: options.tlsCert.certFile,
          keyFile: options.tlsCert.keyFile,
        },
      },
    }
    log.deploy.debug('Using file-based TLS certificate', {
      appId,
      domain,
      certFile: options.tlsCert.certFile,
    })
  } else {
    // Use ACME cert resolver
    tlsConfig = {
      certResolver: config.certResolver,
    }
  }

  // Build Traefik dynamic config
  const traefikConfig: Record<string, unknown> = {
    http: {
      routers: {
        [`${routerId}-http`]: {
          rule: `Host(\`${domain}\`)`,
          service: routerId,
          entryPoints: ['web'],
          middlewares: ['redirect-to-https'],
        },
        [`${routerId}-https`]: {
          rule: `Host(\`${domain}\`)`,
          service: routerId,
          entryPoints: ['websecure'],
          tls: tlsConfig,
        },
      },
      services: {
        [routerId]: {
          loadBalancer: {
            servers: [{ url: upstreamUrl }],
            passHostHeader: true,
          },
        },
      },
    },
  }

  // Add TLS stores config if using file certs
  if (tlsStores) {
    traefikConfig.tls = { stores: tlsStores }
  }

  try {
    const yamlContent = stringifyYaml(traefikConfig)
    await writeFile(filepath, yamlContent, 'utf-8')

    log.deploy.info('Added Traefik route', {
      appId,
      domain,
      upstreamUrl,
      filepath,
      usingFileCert: !!options?.tlsCert,
    })

    return { success: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log.deploy.error('Failed to add Traefik route', { appId, domain, error })
    return { success: false, error }
  }
}

/**
 * Remove a Traefik route for an app
 */
export async function removeRoute(
  config: TraefikConfig,
  appId: string,
  appName?: string
): Promise<{ success: boolean; error?: string }> {
  // Try both new format (with app name) and legacy format (id only)
  const filesToTry = [
    appName ? getConfigFilename(appId, appName) : null,
    getConfigFilename(appId), // Legacy format fallback
  ].filter(Boolean) as string[]

  let deleted = false
  let lastError: string | undefined

  for (const filename of filesToTry) {
    const filepath = join(config.configDir, filename)
    try {
      await unlink(filepath)
      log.deploy.info('Removed Traefik route', { appId, filepath })
      deleted = true
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        lastError = err instanceof Error ? err.message : String(err)
      }
    }
  }

  if (deleted || !lastError) {
    if (!deleted) {
      log.deploy.debug('Traefik route file not found, nothing to remove', { appId })
    }
    return { success: true }
  }

  log.deploy.error('Failed to remove Traefik route', { appId, error: lastError })
  return { success: false, error: lastError }
}

/**
 * Check if Traefik API is available (optional, for health checks)
 */
export async function checkTraefikHealth(apiUrl = 'http://localhost:8080'): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl}/api/overview`, {
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}
