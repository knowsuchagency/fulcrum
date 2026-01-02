import { spawn, type ChildProcess } from 'child_process'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join, resolve, isAbsolute } from 'path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { log } from '../lib/logger'
import { getShellEnv } from '../lib/env'
import { expandEnvVar, splitRespectingEnvVars } from '../lib/env-expand'

export interface SwarmServiceStatus {
  id: string
  name: string // Full name: stack_service
  serviceName: string // Original service name
  mode: string // replicated | global
  replicas: string // "1/1" format
  image: string
  ports: string[]
}

export interface StackDeployOptions {
  stackName: string
  cwd: string
  composeFile?: string
  env?: Record<string, string>
  signal?: AbortSignal
  onProcess?: (proc: ChildProcess) => void
}

/**
 * Run a docker command and return the output
 */
async function runDocker(
  args: string[],
  options: {
    cwd?: string
    env?: Record<string, string>
    signal?: AbortSignal
    onProcess?: (proc: ChildProcess) => void
  } = {},
  onOutput?: (line: string) => void
): Promise<{ stdout: string; stderr: string; exitCode: number; aborted?: boolean }> {
  // Check if already aborted
  if (options.signal?.aborted) {
    return { stdout: '', stderr: 'Aborted', exitCode: -1, aborted: true }
  }

  log.deploy.debug('Running docker command', { args, cwd: options.cwd })

  return new Promise((resolve) => {
    const proc = spawn('docker', args, {
      cwd: options.cwd,
      env: {
        ...getShellEnv(),
        ...options.env,
      },
    })

    // Allow caller to track the process for cancellation
    options.onProcess?.(proc)

    let stdout = ''
    let stderr = ''
    let aborted = false

    // Handle abort signal
    const abortHandler = () => {
      if (!proc.killed) {
        log.deploy.info('Aborting docker command', { args })
        aborted = true
        proc.kill('SIGTERM')
      }
    }
    options.signal?.addEventListener('abort', abortHandler)

    proc.stdout.on('data', (data) => {
      const text = data.toString()
      stdout += text
      if (onOutput) {
        for (const line of text.split('\n').filter(Boolean)) {
          onOutput(line)
        }
      }
    })

    proc.stderr.on('data', (data) => {
      const text = data.toString()
      stderr += text
      if (onOutput) {
        for (const line of text.split('\n').filter(Boolean)) {
          onOutput(line)
        }
      }
    })

    proc.on('close', (code) => {
      options.signal?.removeEventListener('abort', abortHandler)
      resolve({ stdout, stderr, exitCode: code ?? 0, aborted })
    })

    proc.on('error', (err) => {
      options.signal?.removeEventListener('abort', abortHandler)
      log.deploy.error('Docker spawn error', { error: String(err) })
      resolve({ stdout, stderr, exitCode: 1, aborted })
    })
  })
}

/**
 * Check if Docker Swarm mode is active
 */
export async function checkSwarmActive(): Promise<boolean> {
  const result = await runDocker(['info', '--format', '{{.Swarm.LocalNodeState}}'])

  if (result.exitCode !== 0) {
    log.deploy.warn('Failed to check swarm status', { stderr: result.stderr })
    return false
  }

  const state = result.stdout.trim()
  return state === 'active'
}

/**
 * Initialize Docker Swarm mode
 */
export async function initSwarm(): Promise<{ success: boolean; error?: string }> {
  log.deploy.info('Initializing Docker Swarm')

  const result = await runDocker(['swarm', 'init'])

  if (result.exitCode !== 0) {
    // Check if already initialized
    if (result.stderr.includes('already part of a swarm')) {
      log.deploy.info('Swarm already initialized')
      return { success: true }
    }

    log.deploy.error('Failed to initialize swarm', { stderr: result.stderr })
    return { success: false, error: result.stderr || 'Failed to initialize swarm' }
  }

  log.deploy.info('Swarm initialized successfully')
  return { success: true }
}

/**
 * Ensure Swarm mode is active, initialize if needed
 */
export async function ensureSwarmMode(): Promise<{ initialized: boolean; error?: string }> {
  const isActive = await checkSwarmActive()

  if (isActive) {
    return { initialized: true }
  }

  const result = await initSwarm()
  return { initialized: result.success, error: result.error }
}

/**
 * Generate a Swarm-compatible compose file
 *
 * Docker Swarm has different requirements than docker compose:
 * - Cannot build images inline (needs pre-built images with `image` field)
 * - Uses `deploy.restart_policy` instead of `restart`
 *
 * This function creates a modified compose file that:
 * 1. Adds `image: {projectName}-{serviceName}` for services with `build` but no `image`
 * 2. Removes `restart` (Swarm handles this via deploy config)
 * 3. Optionally attaches services to an external network (for Traefik routing)
 * 4. Writes to `swarm-compose.yml` in the specified output directory
 */
export async function generateSwarmComposeFile(
  cwd: string,
  composeFile: string,
  projectName: string,
  externalNetwork: string | undefined, // Optional external network for ingress (e.g., dokploy-network)
  outputDir: string // Directory to write the swarm compose file (e.g., VIBORA_DIR/apps/{appId})
): Promise<{ success: boolean; swarmFile: string; error?: string }> {
  const swarmFileName = 'swarm-compose.yml'
  const originalPath = join(cwd, composeFile)
  const swarmPath = join(outputDir, swarmFileName)

  try {
    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true })

    // Read and parse the original compose file
    const content = await readFile(originalPath, 'utf-8')
    const parsed = parseYaml(content) as Record<string, unknown>

    if (!parsed || typeof parsed !== 'object') {
      return { success: false, swarmFile: swarmPath, error: 'Invalid compose file format' }
    }

    const services = parsed.services as Record<string, Record<string, unknown>> | undefined
    if (!services) {
      return { success: false, swarmFile: swarmPath, error: 'No services found in compose file' }
    }

    // Track which services were modified
    const modified: string[] = []

    // Process each service
    for (const [serviceName, serviceConfig] of Object.entries(services)) {
      // If service has build but no image, add image field
      // docker compose build creates images as: {projectName}-{serviceName}
      if (serviceConfig.build && !serviceConfig.image) {
        const imageName = `${projectName}-${serviceName}`
        serviceConfig.image = imageName
        modified.push(serviceName)
        log.deploy.warn('Added image field for Swarm (Swarm cannot build inline)', {
          service: serviceName,
          image: imageName,
        })
      }

      // Remove restart (Swarm uses deploy.restart_policy)
      if (serviceConfig.restart) {
        log.deploy.warn('Removed restart field (use deploy.restart_policy for Swarm)', {
          service: serviceName,
          restart: serviceConfig.restart,
        })
        delete serviceConfig.restart
      }

      // Convert depends_on from object format to list format
      // Docker Swarm only supports list format: depends_on: [service1, service2]
      // It does NOT support object format: depends_on: { db: { condition: service_healthy } }
      if (serviceConfig.depends_on && typeof serviceConfig.depends_on === 'object' && !Array.isArray(serviceConfig.depends_on)) {
        const conditions = Object.entries(serviceConfig.depends_on as Record<string, { condition?: string }>)
          .map(([svc, cfg]) => cfg.condition ? `${svc}:${cfg.condition}` : svc)
          .join(', ')
        log.deploy.warn('Converting depends_on to list format (conditions ignored by Swarm)', {
          service: serviceName,
          original: conditions,
        })
        serviceConfig.depends_on = Object.keys(serviceConfig.depends_on)
      }

      // Resolve relative volume paths to absolute paths
      // When the swarm compose file is written to VIBORA_DIR, relative paths
      // like ".:/app" would resolve to that directory instead of the repo
      if (Array.isArray(serviceConfig.volumes)) {
        serviceConfig.volumes = serviceConfig.volumes.map((vol: unknown) =>
          resolveVolumeEntry(vol, cwd)
        )
      }

      // Convert ports to host mode to bypass ingress routing mesh
      // The Docker Swarm ingress network can become corrupted after service updates,
      // causing connections to hang. Host mode binds directly to the node.
      if (Array.isArray(serviceConfig.ports)) {
        serviceConfig.ports = serviceConfig.ports.map((port: unknown) =>
          convertPortToHostMode(port)
        )
        log.deploy.debug('Converted ports to host mode', {
          service: serviceName,
          ports: serviceConfig.ports,
        })
      }

      // Remove fields not supported by Docker Swarm
      // These would cause "unsupported" errors or be silently ignored
      const unsupportedFields = [
        'container_name',  // Swarm names containers: stack_service.slot.id
        'links',           // Deprecated, use networks instead
        'network_mode',    // Use networks with driver options
        'devices',         // Not supported in Swarm
        'tmpfs',           // Use mounts with type: tmpfs in deploy
        'userns_mode',     // Not supported
        'sysctls',         // Not supported
        'security_opt',    // Not supported (use no_new_privileges in deploy)
        'cpu_count',       // Use deploy.resources.limits.cpus
        'cpu_percent',     // Use deploy.resources
        'cpus',            // Use deploy.resources.limits.cpus
        'mem_limit',       // Use deploy.resources.limits.memory
        'memswap_limit',   // Use deploy.resources
        'mem_reservation', // Use deploy.resources.reservations.memory
      ]
      const removedFields: string[] = []
      for (const field of unsupportedFields) {
        if (field in serviceConfig) {
          removedFields.push(field)
          delete serviceConfig[field]
        }
      }
      if (removedFields.length > 0) {
        log.deploy.warn('Removed unsupported Swarm fields', {
          service: serviceName,
          fields: removedFields,
        })
      }

      // Add external network to service if specified
      if (externalNetwork) {
        const existingNetworks = serviceConfig.networks as string[] | Record<string, unknown> | undefined

        if (Array.isArray(existingNetworks)) {
          // Array format: ["default", "other"]
          if (!existingNetworks.includes(externalNetwork)) {
            existingNetworks.push(externalNetwork)
          }
        } else if (existingNetworks && typeof existingNetworks === 'object') {
          // Object format: { default: {}, other: {} }
          if (!(externalNetwork in existingNetworks)) {
            existingNetworks[externalNetwork] = {}
          }
        } else {
          // No networks defined, create array with default and external
          serviceConfig.networks = ['default', externalNetwork]
        }
      }
    }

    // Add external network definition at top level if specified
    if (externalNetwork) {
      const networks = (parsed.networks || {}) as Record<string, unknown>
      networks[externalNetwork] = { external: true }
      parsed.networks = networks
    }

    // Write the modified compose file
    const swarmContent = stringifyYaml(parsed)
    await writeFile(swarmPath, swarmContent, 'utf-8')

    if (modified.length > 0 || externalNetwork) {
      log.deploy.info('Generated Swarm compose file', {
        swarmFile: swarmPath,
        modifiedServices: modified,
        externalNetwork: externalNetwork || null,
      })
    }

    return { success: true, swarmFile: swarmPath }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log.deploy.error('Failed to generate Swarm compose file', { error })
    return { success: false, swarmFile: swarmPath, error }
  }
}

/**
 * Deploy a stack using docker stack deploy
 */
export async function stackDeploy(
  options: StackDeployOptions,
  onOutput?: (line: string) => void
): Promise<{ success: boolean; error?: string; aborted?: boolean }> {
  // Check if already aborted
  if (options.signal?.aborted) {
    return { success: false, error: 'Deploy cancelled', aborted: true }
  }

  log.deploy.info('Deploying stack', { stackName: options.stackName })

  const args = ['stack', 'deploy']

  // Add compose file
  const composeFile = options.composeFile || 'docker-compose.yml'
  args.push('-c', composeFile)

  // Add stack name
  args.push(options.stackName)

  const result = await runDocker(
    args,
    { cwd: options.cwd, env: options.env, signal: options.signal, onProcess: options.onProcess },
    onOutput
  )

  if (result.aborted) {
    log.deploy.info('Stack deploy cancelled', { stackName: options.stackName })
    return { success: false, error: 'Deploy cancelled', aborted: true }
  }

  if (result.exitCode !== 0) {
    log.deploy.error('Stack deploy failed', {
      stackName: options.stackName,
      exitCode: result.exitCode,
      stderr: result.stderr.slice(0, 500),
    })
    return { success: false, error: result.stderr || 'Stack deploy failed' }
  }

  log.deploy.info('Stack deployed successfully', { stackName: options.stackName })
  return { success: true }
}

/**
 * Remove a stack
 */
export async function stackRemove(stackName: string): Promise<{ success: boolean; error?: string }> {
  log.deploy.info('Removing stack', { stackName })

  const result = await runDocker(['stack', 'rm', stackName])

  if (result.exitCode !== 0) {
    // Check if stack doesn't exist (not an error)
    if (result.stderr.includes('Nothing found in stack')) {
      log.deploy.info('Stack not found, nothing to remove', { stackName })
      return { success: true }
    }

    log.deploy.error('Stack remove failed', {
      stackName,
      exitCode: result.exitCode,
      stderr: result.stderr,
    })
    return { success: false, error: result.stderr || 'Stack remove failed' }
  }

  log.deploy.info('Stack removed successfully', { stackName })
  return { success: true }
}

/**
 * Get services in a stack
 */
export async function stackServices(stackName: string): Promise<SwarmServiceStatus[]> {
  const result = await runDocker([
    'stack',
    'services',
    stackName,
    '--format',
    '{{json .}}',
  ])

  if (result.exitCode !== 0) {
    log.deploy.error('Failed to get stack services', { stackName, stderr: result.stderr })
    return []
  }

  try {
    const services: SwarmServiceStatus[] = []

    for (const line of result.stdout.split('\n').filter(Boolean)) {
      const svc = JSON.parse(line)

      // Service name format: stackName_serviceName
      const fullName = svc.Name || ''
      const serviceName = fullName.startsWith(`${stackName}_`)
        ? fullName.slice(stackName.length + 1)
        : fullName

      services.push({
        id: svc.ID || '',
        name: fullName,
        serviceName,
        mode: svc.Mode || 'replicated',
        replicas: svc.Replicas || '0/0',
        image: svc.Image || '',
        ports: parsePorts(svc.Ports || ''),
      })
    }

    return services
  } catch (err) {
    log.deploy.error('Failed to parse stack services output', {
      error: String(err),
      stdout: result.stdout.slice(0, 200),
    })
    return []
  }
}

/**
 * Parse ports string from docker stack services
 * Example: "*:8080->80/tcp"
 */
function parsePorts(portsStr: string): string[] {
  if (!portsStr) return []
  return portsStr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Get logs from a swarm service
 */
export async function serviceLogs(
  serviceName: string,
  tail = 100
): Promise<string> {
  const result = await runDocker([
    'service',
    'logs',
    '--no-trunc',
    '-t',
    `--tail=${tail}`,
    serviceName,
  ])

  // Combine stdout and stderr (docker logs go to both)
  return result.stdout + result.stderr
}

/**
 * Force update a service (triggers a rolling restart)
 */
export async function serviceUpdate(
  serviceName: string
): Promise<{ success: boolean; error?: string }> {
  const result = await runDocker(['service', 'update', '--force', serviceName])

  if (result.exitCode !== 0) {
    return { success: false, error: result.stderr || 'Service update failed' }
  }

  return { success: true }
}

/**
 * Check if a service has completed tasks (for one-shot services)
 * Returns true if the service has at least one "Complete" task and no "Failed" tasks
 */
async function hasCompletedTasks(serviceName: string): Promise<boolean> {
  const result = await runDocker([
    'service',
    'ps',
    serviceName,
    '--format',
    '{{.CurrentState}}',
    '--filter',
    'desired-state=shutdown',
  ])

  if (result.exitCode !== 0) {
    return false
  }

  const states = result.stdout.trim().split('\n').filter(Boolean)

  // Check if any task completed successfully (state starts with "Complete")
  const hasComplete = states.some((s) => s.startsWith('Complete'))
  // Check if any task failed
  const hasFailed = states.some((s) => s.startsWith('Failed') || s.startsWith('Rejected'))

  return hasComplete && !hasFailed
}

/**
 * Check if a service is healthy
 * - Replicas match (1/1, 2/2, etc.) = healthy
 * - 0 running with completed tasks (one-shot service) = healthy
 * - Otherwise = not healthy
 */
async function isServiceHealthy(svc: SwarmServiceStatus): Promise<boolean> {
  const [current, desired] = svc.replicas.split('/').map(Number)

  if (isNaN(current) || isNaN(desired)) {
    return false
  }

  // Normal case: replicas match
  if (current === desired) {
    return true
  }

  // One-shot service case: 0 running, but has completed tasks
  // This handles services like "migrate" that run once and exit
  if (current === 0 && desired > 0) {
    const completed = await hasCompletedTasks(svc.name)
    if (completed) {
      log.deploy.debug('One-shot service completed', { service: svc.serviceName })
      return true
    }
  }

  return false
}

/**
 * Wait for all services in a stack to be healthy (replicas match desired)
 */
export async function waitForServicesHealthy(
  stackName: string,
  timeoutMs = 300000, // 5 minutes default
  signal?: AbortSignal
): Promise<{ healthy: boolean; failedServices: string[]; aborted?: boolean }> {
  // Check if already aborted
  if (signal?.aborted) {
    return { healthy: false, failedServices: [], aborted: true }
  }

  const startTime = Date.now()
  const checkInterval = 5000 // 5 seconds

  log.deploy.info('Waiting for services to be healthy', { stackName, timeoutMs })

  while (Date.now() - startTime < timeoutMs) {
    // Check for abort at each iteration
    if (signal?.aborted) {
      log.deploy.info('Health check cancelled', { stackName })
      return { healthy: false, failedServices: [], aborted: true }
    }

    const services = await stackServices(stackName)

    if (services.length === 0) {
      // Services not yet registered, wait and retry
      await sleep(checkInterval)
      continue
    }

    let allHealthy = true
    const unhealthyServices: string[] = []

    for (const svc of services) {
      const healthy = await isServiceHealthy(svc)
      if (!healthy) {
        allHealthy = false
        unhealthyServices.push(svc.serviceName)
      }
    }

    if (allHealthy) {
      log.deploy.info('All services healthy', { stackName })
      return { healthy: true, failedServices: [] }
    }

    log.deploy.info('Services not yet healthy', {
      stackName,
      unhealthyServices,
      elapsed: Date.now() - startTime,
    })

    await sleep(checkInterval)
  }

  // Timeout reached - collect failed services
  const services = await stackServices(stackName)
  const failedServices: string[] = []

  for (const svc of services) {
    const healthy = await isServiceHealthy(svc)
    if (!healthy) {
      failedServices.push(svc.serviceName)
    }
  }

  log.deploy.warn('Timeout waiting for services', { stackName, failedServices })
  return { healthy: false, failedServices }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

interface SwarmPortConfig {
  target: number
  published: number
  protocol?: string
  mode: 'host' | 'ingress'
}

/**
 * Convert a port specification to host mode format
 * Docker Swarm ports can be specified as:
 * - Short syntax: "3000:3000" or "8080:80/tcp"
 * - Long syntax: { target: 80, published: 8080, protocol: tcp, mode: ingress }
 *
 * We convert all to long syntax with mode: host to bypass the ingress routing mesh
 */
function convertPortToHostMode(port: unknown): SwarmPortConfig {
  if (typeof port === 'string') {
    // Parse short syntax: "published:target", "published:target/protocol", or just "port"
    // Handle env var syntax like "${PORT:-3001}:${PORT:-3001}"
    const [portPart, protocol] = port.split('/')

    // Expand env vars in port parts (use splitRespectingEnvVars for ${VAR:-default} syntax)
    const rawParts = splitRespectingEnvVars(portPart)
    const parts = rawParts.map((p) => {
      const expanded = expandEnvVar(p)
      return expanded ? Number(expanded) : NaN
    })

    // Handle "3001" (single port) vs "3001:3001" (published:target)
    const published = parts[0]
    const target = parts.length > 1 ? parts[1] : parts[0]

    // If we still have NaN, the port can't be statically resolved
    // Skip port conversion and log a warning
    if (isNaN(published) || isNaN(target)) {
      log.deploy.warn('Could not parse port specification, skipping host mode conversion', {
        port,
        parsed: { published, target },
      })
      // Return a placeholder that will cause docker to fail with a clear error
      // rather than silently producing invalid config
      throw new Error(`Cannot parse port specification: ${port}`)
    }

    return {
      target,
      published,
      protocol: protocol || 'tcp',
      mode: 'host',
    }
  }

  if (typeof port === 'number') {
    // Just a port number
    return {
      target: port,
      published: port,
      protocol: 'tcp',
      mode: 'host',
    }
  }

  if (typeof port === 'object' && port !== null) {
    // Already long syntax, just ensure host mode
    const p = port as Record<string, unknown>
    return {
      target: (p.target as number) || (p.published as number),
      published: (p.published as number) || (p.target as number),
      protocol: (p.protocol as string) || 'tcp',
      mode: 'host',
    }
  }

  // Fallback - shouldn't happen
  throw new Error(`Invalid port specification: ${JSON.stringify(port)}`)
}

/**
 * Resolve a volume path to an absolute path if it's relative
 * Named volumes (no slashes) and absolute paths are returned as-is
 * Handles env var syntax like ${DATA_DIR:-./data}
 */
function resolveVolumePath(volumePath: string, basePath: string): string {
  // Try to expand env var syntax first
  const expanded = expandEnvVar(volumePath)
  const pathToCheck = expanded ?? volumePath // Use original if can't expand

  // Named volumes don't have slashes in the host part
  // Examples: "my-data", "app-data"
  if (!pathToCheck.includes('/') && !pathToCheck.startsWith('.')) {
    return volumePath // Named volume, return as-is (preserve original syntax)
  }

  // If we couldn't expand the env var and it contains ${, return as-is
  // Docker will handle the expansion at runtime
  if (expanded === null && volumePath.includes('${')) {
    return volumePath
  }

  // Already absolute
  if (isAbsolute(pathToCheck)) {
    return expanded ?? volumePath
  }

  // Relative path - resolve against basePath
  return resolve(basePath, pathToCheck)
}

/**
 * Parse and transform volume entries to resolve relative paths
 * Handles both short syntax ("./host:/container") and long syntax ({ type: bind, source: ./host, target: /container })
 * Also handles env var syntax like "${DATA_DIR:-./data}:/app/data"
 */
function resolveVolumeEntry(volume: unknown, basePath: string): unknown {
  // Short syntax: string like "./host:/container:ro" or "volume_name:/container"
  if (typeof volume === 'string') {
    // Use splitRespectingEnvVars to handle ${VAR:-default} syntax
    const parts = splitRespectingEnvVars(volume)
    if (parts.length >= 2) {
      // Format: host:container or host:container:options
      const hostPath = parts[0]
      const containerPath = parts[1]
      const options = parts.slice(2).join(':')

      const resolvedHost = resolveVolumePath(hostPath, basePath)

      // Only log if we actually resolved a relative path
      if (resolvedHost !== hostPath) {
        log.deploy.debug('Resolved relative volume path', {
          original: hostPath,
          resolved: resolvedHost,
        })
      }

      return options ? `${resolvedHost}:${containerPath}:${options}` : `${resolvedHost}:${containerPath}`
    }
    // Just container path (anonymous volume), return as-is
    return volume
  }

  // Long syntax: object with type, source, target
  if (typeof volume === 'object' && volume !== null) {
    const vol = volume as Record<string, unknown>
    if (vol.type === 'bind' && typeof vol.source === 'string') {
      const resolvedSource = resolveVolumePath(vol.source, basePath)
      if (resolvedSource !== vol.source) {
        log.deploy.debug('Resolved relative volume path (long syntax)', {
          original: vol.source,
          resolved: resolvedSource,
        })
        return { ...vol, source: resolvedSource }
      }
    }
    return vol
  }

  return volume
}

export interface CloudflaredServiceConfig {
  tunnelToken: string
  network: string // Must be same network as app services for routing
}

/**
 * Add cloudflared service to a Swarm compose file
 * This injects a cloudflare/cloudflared container that runs the tunnel
 * and connects to the same network as the app services
 */
export async function addCloudflaredToStack(
  swarmFilePath: string, // Absolute path to the swarm compose file
  config: CloudflaredServiceConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const content = await readFile(swarmFilePath, 'utf-8')
    const parsed = parseYaml(content) as Record<string, unknown>

    const services = parsed.services as Record<string, Record<string, unknown>>
    if (!services) {
      return { success: false, error: 'No services found in compose file' }
    }

    // Add cloudflared service
    services['cloudflared'] = {
      image: 'cloudflare/cloudflared:latest',
      command: ['tunnel', '--no-autoupdate', 'run'],
      environment: {
        TUNNEL_TOKEN: config.tunnelToken,
      },
      networks: ['default', config.network],
      deploy: {
        replicas: 1,
        restart_policy: {
          condition: 'any',
          delay: '5s',
          max_attempts: 3,
          window: '120s',
        },
      },
    }

    // Ensure the external network is defined
    const networks = (parsed.networks || {}) as Record<string, unknown>
    if (!networks[config.network]) {
      networks[config.network] = { external: true }
      parsed.networks = networks
    }

    await writeFile(swarmFilePath, stringifyYaml(parsed), 'utf-8')
    log.deploy.info('Added cloudflared service to stack', { swarmFile: swarmFilePath })
    return { success: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log.deploy.error('Failed to add cloudflared service', { error })
    return { success: false, error }
  }
}
