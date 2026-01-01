import { writeFile, unlink, access, constants } from 'fs/promises'
import { join } from 'path'
import { stringify as stringifyYaml } from 'yaml'
import { log } from '../lib/logger'
import { runDocker } from './docker-compose'

export interface TraefikConfig {
  configDir: string // e.g., /etc/dokploy/traefik/dynamic
  network: string // e.g., dokploy-network
  certResolver: string // e.g., letsencrypt
  containerName: string // e.g., dokploy-traefik
  type: 'dokploy' | 'vibora' | 'other'
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

    // Check for vibora-traefik
    const viboraResult = await runDocker([
      'inspect',
      'vibora-traefik',
      '--format',
      '{{json .}}',
    ])

    if (viboraResult.exitCode === 0) {
      const container = JSON.parse(viboraResult.stdout) as DockerContainer
      return parseTraefikContainer(container, 'vibora')
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
  type: 'dokploy' | 'vibora' | 'other'
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
    // Default fallback
    configDir = type === 'vibora' ? '/etc/vibora/traefik/dynamic' : '/etc/traefik/dynamic'
  }

  // Find the network - prefer dokploy-network, then any network
  const networks = Object.keys(container.NetworkSettings?.Networks || {})
  const network =
    networks.find((n) => n === 'dokploy-network') ||
    networks.find((n) => n === 'vibora-network') ||
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
 */
function getConfigFilename(appId: string): string {
  return `vibora-${appId}.yml`
}

/**
 * Add a Traefik route for an app service
 */
export async function addRoute(
  config: TraefikConfig,
  appId: string,
  domain: string,
  upstreamUrl: string
): Promise<{ success: boolean; error?: string }> {
  const routerId = `vibora-${appId}`
  const filename = getConfigFilename(appId)
  const filepath = join(config.configDir, filename)

  // Build Traefik dynamic config
  const traefikConfig = {
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
          tls: {
            certResolver: config.certResolver,
          },
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

  try {
    const yamlContent = stringifyYaml(traefikConfig)
    await writeFile(filepath, yamlContent, 'utf-8')

    log.deploy.info('Added Traefik route', {
      appId,
      domain,
      upstreamUrl,
      filepath,
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
  appId: string
): Promise<{ success: boolean; error?: string }> {
  const filename = getConfigFilename(appId)
  const filepath = join(config.configDir, filename)

  try {
    await unlink(filepath)
    log.deploy.info('Removed Traefik route', { appId, filepath })
    return { success: true }
  } catch (err) {
    // File not existing is not an error
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      log.deploy.debug('Traefik route file not found, nothing to remove', { appId })
      return { success: true }
    }

    const error = err instanceof Error ? err.message : String(err)
    log.deploy.error('Failed to remove Traefik route', { appId, error })
    return { success: false, error }
  }
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
