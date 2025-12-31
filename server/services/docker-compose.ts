import { spawn } from 'child_process'
import { log } from '../lib/logger'

export interface ContainerStatus {
  name: string
  service: string
  status: string
  health?: string
  ports: string[]
}

export interface ComposeCommandOptions {
  projectName: string
  cwd: string
  composeFile?: string
}

/**
 * Run a docker compose command and return the output
 */
async function runCompose(
  args: string[],
  options: ComposeCommandOptions,
  onOutput?: (line: string) => void
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const fullArgs = ['compose', '-p', options.projectName]

  if (options.composeFile) {
    fullArgs.push('-f', options.composeFile)
  }

  fullArgs.push(...args)

  log.deploy.debug('Running docker compose command', { args: fullArgs, cwd: options.cwd })

  return new Promise((resolve) => {
    const proc = spawn('docker', fullArgs, {
      cwd: options.cwd,
      env: { ...process.env },
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
      log.deploy.error('Docker compose spawn error', { error: String(err) })
      resolve({ stdout, stderr, exitCode: 1 })
    })
  })
}

/**
 * Build the compose stack
 */
export async function composeBuild(
  options: ComposeCommandOptions,
  onOutput?: (line: string) => void
): Promise<{ success: boolean; error?: string }> {
  log.deploy.info('Building compose stack', { project: options.projectName })

  const result = await runCompose(['build', '--progress', 'plain'], options, onOutput)

  if (result.exitCode !== 0) {
    log.deploy.error('Compose build failed', {
      project: options.projectName,
      exitCode: result.exitCode,
      stderr: result.stderr.slice(0, 500),
    })
    return { success: false, error: result.stderr || 'Build failed' }
  }

  log.deploy.info('Compose build succeeded', { project: options.projectName })
  return { success: true }
}

/**
 * Start the compose stack (with optional build)
 */
export async function composeUp(
  options: ComposeCommandOptions,
  buildFirst = false,
  onOutput?: (line: string) => void
): Promise<{ success: boolean; error?: string }> {
  log.deploy.info('Starting compose stack', { project: options.projectName, buildFirst })

  const args = ['up', '-d', '--remove-orphans']
  if (buildFirst) {
    args.push('--build')
  }

  const result = await runCompose(args, options, onOutput)

  if (result.exitCode !== 0) {
    log.deploy.error('Compose up failed', {
      project: options.projectName,
      exitCode: result.exitCode,
      stderr: result.stderr.slice(0, 500),
    })
    return { success: false, error: result.stderr || 'Failed to start containers' }
  }

  log.deploy.info('Compose stack started', { project: options.projectName })
  return { success: true }
}

/**
 * Stop the compose stack
 */
export async function composeDown(
  options: ComposeCommandOptions,
  removeVolumes = false
): Promise<{ success: boolean; error?: string }> {
  log.deploy.info('Stopping compose stack', { project: options.projectName, removeVolumes })

  const args = ['down']
  if (removeVolumes) {
    args.push('-v')
  }

  const result = await runCompose(args, options)

  if (result.exitCode !== 0) {
    log.deploy.error('Compose down failed', {
      project: options.projectName,
      exitCode: result.exitCode,
      stderr: result.stderr.slice(0, 500),
    })
    return { success: false, error: result.stderr || 'Failed to stop containers' }
  }

  log.deploy.info('Compose stack stopped', { project: options.projectName })
  return { success: true }
}

/**
 * Get the status of containers in the compose stack
 */
export async function composePs(options: ComposeCommandOptions): Promise<ContainerStatus[]> {
  const result = await runCompose(['ps', '--format', 'json'], options)

  if (result.exitCode !== 0) {
    log.deploy.error('Compose ps failed', { project: options.projectName })
    return []
  }

  try {
    // docker compose ps --format json outputs one JSON object per line
    const containers: ContainerStatus[] = []
    for (const line of result.stdout.split('\n').filter(Boolean)) {
      const container = JSON.parse(line)
      containers.push({
        name: container.Name || container.name,
        service: container.Service || container.service,
        status: container.State || container.state || 'unknown',
        health: container.Health || container.health,
        ports: parsePortsOutput(container.Ports || container.ports || ''),
      })
    }
    return containers
  } catch (err) {
    log.deploy.error('Failed to parse compose ps output', {
      error: String(err),
      stdout: result.stdout.slice(0, 200),
    })
    return []
  }
}

/**
 * Parse the ports string from docker compose ps
 * Example: "0.0.0.0:8080->80/tcp, :::8080->80/tcp"
 */
function parsePortsOutput(portsStr: string): string[] {
  if (!portsStr) return []
  return portsStr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Get logs from compose services
 */
export async function composeLogs(
  options: ComposeCommandOptions,
  serviceName?: string,
  tail = 100
): Promise<string> {
  const args = ['logs', '--no-color', '-t', `--tail=${tail}`]
  if (serviceName) {
    args.push(serviceName)
  }

  const result = await runCompose(args, options)
  return result.stdout + result.stderr
}

/**
 * Pull latest images for the compose stack
 */
export async function composePull(
  options: ComposeCommandOptions,
  onOutput?: (line: string) => void
): Promise<{ success: boolean; error?: string }> {
  log.deploy.info('Pulling compose images', { project: options.projectName })

  const result = await runCompose(['pull'], options, onOutput)

  if (result.exitCode !== 0) {
    log.deploy.warn('Compose pull had issues', {
      project: options.projectName,
      stderr: result.stderr.slice(0, 200),
    })
    // Pull failures are often non-fatal (local builds don't have images to pull)
  }

  return { success: true }
}

/**
 * Restart a specific service or all services
 */
export async function composeRestart(
  options: ComposeCommandOptions,
  serviceName?: string
): Promise<{ success: boolean; error?: string }> {
  const args = ['restart']
  if (serviceName) {
    args.push(serviceName)
  }

  const result = await runCompose(args, options)

  if (result.exitCode !== 0) {
    return { success: false, error: result.stderr || 'Restart failed' }
  }

  return { success: true }
}

/**
 * Check if docker is available
 */
export async function checkDockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('docker', ['info'], { stdio: 'ignore' })
    proc.on('close', (code) => resolve(code === 0))
    proc.on('error', () => resolve(false))
  })
}
