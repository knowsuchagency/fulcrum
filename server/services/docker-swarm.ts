import { spawn } from 'child_process'
import { log } from '../lib/logger'
import { getShellEnv } from '../lib/env'

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
}

/**
 * Run a docker command and return the output
 */
async function runDocker(
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
  onOutput?: (line: string) => void
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  log.deploy.debug('Running docker command', { args, cwd: options.cwd })

  return new Promise((resolve) => {
    const proc = spawn('docker', args, {
      cwd: options.cwd,
      env: {
        ...getShellEnv(),
        ...options.env,
      },
    })

    let stdout = ''
    let stderr = ''

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
      resolve({ stdout, stderr, exitCode: code ?? 0 })
    })

    proc.on('error', (err) => {
      log.deploy.error('Docker spawn error', { error: String(err) })
      resolve({ stdout, stderr, exitCode: 1 })
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
 * Deploy a stack using docker stack deploy
 */
export async function stackDeploy(
  options: StackDeployOptions,
  onOutput?: (line: string) => void
): Promise<{ success: boolean; error?: string }> {
  log.deploy.info('Deploying stack', { stackName: options.stackName })

  const args = ['stack', 'deploy']

  // Add compose file
  const composeFile = options.composeFile || 'docker-compose.yml'
  args.push('-c', composeFile)

  // Add stack name
  args.push(options.stackName)

  const result = await runDocker(args, { cwd: options.cwd, env: options.env }, onOutput)

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
 * Wait for all services in a stack to be healthy (replicas match desired)
 */
export async function waitForServicesHealthy(
  stackName: string,
  timeoutMs = 300000 // 5 minutes default
): Promise<{ healthy: boolean; failedServices: string[] }> {
  const startTime = Date.now()
  const checkInterval = 5000 // 5 seconds

  log.deploy.info('Waiting for services to be healthy', { stackName, timeoutMs })

  while (Date.now() - startTime < timeoutMs) {
    const services = await stackServices(stackName)

    if (services.length === 0) {
      // Services not yet registered, wait and retry
      await sleep(checkInterval)
      continue
    }

    let allHealthy = true
    const unhealthyServices: string[] = []

    for (const svc of services) {
      const [current, desired] = svc.replicas.split('/').map(Number)

      if (isNaN(current) || isNaN(desired) || current !== desired) {
        allHealthy = false
        unhealthyServices.push(svc.serviceName)
      }
    }

    if (allHealthy) {
      log.deploy.info('All services healthy', { stackName })
      return { healthy: true, failedServices: [] }
    }

    log.deploy.debug('Services not yet healthy', {
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
    const [current, desired] = svc.replicas.split('/').map(Number)
    if (isNaN(current) || isNaN(desired) || current !== desired) {
      failedServices.push(svc.serviceName)
    }
  }

  log.deploy.warn('Timeout waiting for services', { stackName, failedServices })
  return { healthy: false, failedServices }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
