import { mkdir, writeFile, chmod } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { log } from '../lib/logger'
import { runDocker } from './docker-compose'
import type { TraefikConfig } from './traefik'

export const TRAEFIK_CONTAINER_NAME = 'vibora-traefik'
export const TRAEFIK_IMAGE = 'traefik:v3'
export const TRAEFIK_NETWORK = 'vibora-network'
export const TRAEFIK_CONFIG_DIR = '/etc/vibora/traefik'
export const TRAEFIK_DYNAMIC_DIR = '/etc/vibora/traefik/dynamic'

export type TraefikContainerStatus = 'running' | 'stopped' | 'not_found'

/**
 * Get the status of Vibora's Traefik container
 */
export async function getTraefikContainerStatus(): Promise<TraefikContainerStatus> {
  const result = await runDocker([
    'inspect',
    '--format',
    '{{.State.Running}}',
    TRAEFIK_CONTAINER_NAME,
  ])

  if (result.exitCode !== 0) {
    if (result.stderr.includes('No such object')) {
      return 'not_found'
    }
    log.deploy.warn('Failed to inspect Traefik container', { stderr: result.stderr })
    return 'not_found'
  }

  const isRunning = result.stdout.trim() === 'true'
  return isRunning ? 'running' : 'stopped'
}

/**
 * Ensure the vibora-network exists
 */
async function ensureNetwork(): Promise<{ success: boolean; error?: string }> {
  // Check if network exists
  const checkResult = await runDocker(['network', 'inspect', TRAEFIK_NETWORK])

  if (checkResult.exitCode === 0) {
    return { success: true }
  }

  // Create the network
  log.deploy.info('Creating Docker network', { network: TRAEFIK_NETWORK })
  const createResult = await runDocker([
    'network',
    'create',
    '--driver',
    'overlay',
    '--attachable',
    TRAEFIK_NETWORK,
  ])

  if (createResult.exitCode !== 0) {
    log.deploy.error('Failed to create network', { stderr: createResult.stderr })
    return { success: false, error: createResult.stderr || 'Failed to create network' }
  }

  return { success: true }
}

/**
 * Ensure config directories exist
 */
async function ensureConfigDirs(): Promise<void> {
  if (!existsSync(TRAEFIK_CONFIG_DIR)) {
    await mkdir(TRAEFIK_CONFIG_DIR, { recursive: true })
  }
  if (!existsSync(TRAEFIK_DYNAMIC_DIR)) {
    await mkdir(TRAEFIK_DYNAMIC_DIR, { recursive: true })
  }
}

/**
 * Generate traefik.yml static config
 */
function generateTraefikConfig(acmeEmail: string): string {
  return `# Vibora Traefik Configuration
# Auto-generated - do not edit manually

api:
  dashboard: true
  insecure: true

entryPoints:
  web:
    address: :80
  websecure:
    address: :443
    http:
      tls:
        certResolver: letsencrypt

providers:
  docker:
    exposedByDefault: false
    watch: true
  swarm:
    exposedByDefault: false
    watch: true
  file:
    directory: /etc/traefik/dynamic
    watch: true

certificatesResolvers:
  letsencrypt:
    acme:
      email: ${acmeEmail}
      storage: /etc/traefik/acme.json
      httpChallenge:
        entryPoint: web

log:
  level: INFO

accessLog:
  filePath: /etc/traefik/access.log
  format: json
  bufferingSize: 100
`
}

/**
 * Generate the redirect-to-https middleware config
 */
function generateMiddlewaresConfig(): string {
  return `# Vibora Traefik Middlewares
http:
  middlewares:
    redirect-to-https:
      redirectScheme:
        scheme: https
        permanent: true
`
}

/**
 * Start Vibora's Traefik container
 */
export async function startTraefikContainer(
  acmeEmail: string
): Promise<{ success: boolean; error?: string }> {
  const status = await getTraefikContainerStatus()

  if (status === 'running') {
    log.deploy.info('Traefik container already running')
    return { success: true }
  }

  if (status === 'stopped') {
    // Container exists but stopped, start it
    log.deploy.info('Starting existing Traefik container')
    const result = await runDocker(['start', TRAEFIK_CONTAINER_NAME])

    if (result.exitCode !== 0) {
      log.deploy.error('Failed to start Traefik container', { stderr: result.stderr })
      return { success: false, error: result.stderr || 'Failed to start container' }
    }

    return { success: true }
  }

  // Container doesn't exist, create and start it
  log.deploy.info('Creating Traefik container', { image: TRAEFIK_IMAGE })

  // Ensure network exists
  const networkResult = await ensureNetwork()
  if (!networkResult.success) {
    return networkResult
  }

  // Ensure config directories exist
  await ensureConfigDirs()

  // Write traefik.yml
  const traefikConfigPath = join(TRAEFIK_CONFIG_DIR, 'traefik.yml')
  await writeFile(traefikConfigPath, generateTraefikConfig(acmeEmail), 'utf-8')

  // Write middlewares.yml to dynamic dir
  const middlewaresPath = join(TRAEFIK_DYNAMIC_DIR, 'middlewares.yml')
  await writeFile(middlewaresPath, generateMiddlewaresConfig(), 'utf-8')

  // Create empty acme.json with correct permissions
  const acmePath = join(TRAEFIK_CONFIG_DIR, 'acme.json')
  if (!existsSync(acmePath)) {
    await writeFile(acmePath, '{}', 'utf-8')
    await chmod(acmePath, 0o600)
  }

  // Detect platform for network mode
  const isLinux = process.platform === 'linux'

  const args = [
    'run',
    '-d',
    '--name',
    TRAEFIK_CONTAINER_NAME,
    '--restart',
    'unless-stopped',
    '-v',
    '/var/run/docker.sock:/var/run/docker.sock:ro',
    '-v',
    `${TRAEFIK_CONFIG_DIR}/traefik.yml:/etc/traefik/traefik.yml:ro`,
    '-v',
    `${TRAEFIK_CONFIG_DIR}/acme.json:/etc/traefik/acme.json`,
    '-v',
    `${TRAEFIK_DYNAMIC_DIR}:/etc/traefik/dynamic:ro`,
    '--network',
    TRAEFIK_NETWORK,
  ]

  if (isLinux) {
    // Linux: use host networking for direct port access
    args.push('--network', 'host')
  } else {
    // Mac/Windows: use port mapping
    args.push('-p', '80:80', '-p', '443:443', '-p', '8080:8080')
  }

  args.push(TRAEFIK_IMAGE)

  const result = await runDocker(args)

  if (result.exitCode !== 0) {
    if (result.stderr.includes('port is already allocated')) {
      return {
        success: false,
        error: 'Port 80 or 443 is already in use. Stop the conflicting service first.',
      }
    }
    if (result.stderr.includes('address already in use')) {
      return {
        success: false,
        error: 'Ports required by Traefik are already in use. Stop the conflicting service first.',
      }
    }

    log.deploy.error('Failed to create Traefik container', { stderr: result.stderr })
    return { success: false, error: result.stderr || 'Failed to create container' }
  }

  log.deploy.info('Traefik container created and started')

  // Wait for Traefik to be ready
  const maxWait = 15000
  const checkInterval = 500
  const startTime = Date.now()

  while (Date.now() - startTime < maxWait) {
    try {
      const response = await fetch('http://localhost:8080/api/overview', {
        signal: AbortSignal.timeout(2000),
      })
      if (response.ok) {
        log.deploy.info('Traefik API is available')
        return { success: true }
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, checkInterval))
  }

  log.deploy.warn('Traefik container started but API not responding yet')
  return { success: true } // Container is running, API may just need more time
}

/**
 * Stop Vibora's Traefik container
 */
export async function stopTraefikContainer(): Promise<{ success: boolean; error?: string }> {
  const status = await getTraefikContainerStatus()

  if (status === 'not_found') {
    log.deploy.info('Traefik container not found')
    return { success: true }
  }

  if (status === 'stopped') {
    log.deploy.info('Traefik container already stopped')
    return { success: true }
  }

  log.deploy.info('Stopping Traefik container')
  const result = await runDocker(['stop', TRAEFIK_CONTAINER_NAME])

  if (result.exitCode !== 0) {
    log.deploy.error('Failed to stop Traefik container', { stderr: result.stderr })
    return { success: false, error: result.stderr || 'Failed to stop container' }
  }

  log.deploy.info('Traefik container stopped')
  return { success: true }
}

/**
 * Remove Vibora's Traefik container
 */
export async function removeTraefikContainer(): Promise<{ success: boolean; error?: string }> {
  const status = await getTraefikContainerStatus()

  if (status === 'not_found') {
    return { success: true }
  }

  if (status === 'running') {
    const stopResult = await stopTraefikContainer()
    if (!stopResult.success) {
      return stopResult
    }
  }

  log.deploy.info('Removing Traefik container')
  const result = await runDocker(['rm', TRAEFIK_CONTAINER_NAME])

  if (result.exitCode !== 0) {
    log.deploy.error('Failed to remove Traefik container', { stderr: result.stderr })
    return { success: false, error: result.stderr || 'Failed to remove container' }
  }

  log.deploy.info('Traefik container removed')
  return { success: true }
}

/**
 * Get Traefik container logs
 */
export async function getTraefikLogs(tail = 100): Promise<string> {
  const status = await getTraefikContainerStatus()

  if (status === 'not_found') {
    return 'Traefik container not found'
  }

  const result = await runDocker(['logs', '--tail', String(tail), TRAEFIK_CONTAINER_NAME])

  return result.stdout + result.stderr
}

/**
 * Get Vibora's Traefik config (for use when we start our own Traefik)
 */
export function getViboraTraefikConfig(): TraefikConfig {
  return {
    configDir: TRAEFIK_DYNAMIC_DIR,
    network: TRAEFIK_NETWORK,
    certResolver: 'letsencrypt',
    containerName: TRAEFIK_CONTAINER_NAME,
    type: 'vibora',
  }
}
