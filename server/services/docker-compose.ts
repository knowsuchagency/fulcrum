import { spawn } from 'child_process'
import { log } from '../lib/logger'
import { getShellEnv } from '../lib/env'

export interface ComposeBuildOptions {
  projectName: string
  cwd: string
  composeFile?: string
  env?: Record<string, string>
  noCache?: boolean
}

/**
 * Run a docker compose command and return the output
 */
async function runCompose(
  args: string[],
  options: { projectName: string; cwd: string; composeFile?: string; env?: Record<string, string> },
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
      log.deploy.error('Docker compose spawn error', { error: String(err) })
      resolve({ stdout, stderr, exitCode: 1 })
    })
  })
}

/**
 * Build the compose stack
 *
 * Note: Docker Swarm cannot build images inline, so we still use
 * `docker compose build` before deploying with `docker stack deploy`.
 */
export async function composeBuild(
  options: ComposeBuildOptions,
  onOutput?: (line: string) => void
): Promise<{ success: boolean; error?: string }> {
  log.deploy.info('Building compose stack', { project: options.projectName, noCache: options.noCache })

  const args = ['build', '--progress', 'plain']
  if (options.noCache) {
    args.push('--no-cache')
  }

  const result = await runCompose(args, options, onOutput)

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
 * Check if docker is available
 */
export async function checkDockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('docker', ['info'], { stdio: 'ignore' })
    proc.on('close', (code) => resolve(code === 0))
    proc.on('error', () => resolve(false))
  })
}

/**
 * Check if docker CLI is installed (regardless of daemon status)
 */
export async function checkDockerInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('docker', ['--version'], { stdio: 'ignore' })
    proc.on('close', (code) => resolve(code === 0))
    proc.on('error', () => resolve(false))
  })
}

/**
 * Check if docker daemon is running
 */
export async function checkDockerRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('docker', ['info'], { stdio: 'ignore' })
    proc.on('close', (code) => resolve(code === 0))
    proc.on('error', () => resolve(false))
  })
}

/**
 * Get docker version
 */
export async function getDockerVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn('docker', ['--version'])
    let stdout = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(null)
        return
      }
      // Parse "Docker version 24.0.7, build afdd53b"
      const match = stdout.match(/Docker version ([0-9.]+)/)
      resolve(match ? match[1] : null)
    })

    proc.on('error', () => resolve(null))
  })
}

/**
 * Run a docker command and return the output
 */
export async function runDocker(
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {}
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
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
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
