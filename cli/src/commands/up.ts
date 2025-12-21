import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { output } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import { writePid, readPid, isProcessRunning, getPort } from '../utils/process'

/**
 * Finds the Vibora project root by looking for package.json with name "vibora".
 */
async function findViboraRoot(): Promise<string | null> {
  // Check common locations
  const candidates = [
    process.cwd(),
    join(process.cwd(), '..'),
    // If installed globally, we need the actual vibora source
    // This would typically be set via an env var or config
  ]

  for (const candidate of candidates) {
    const pkgPath = join(candidate, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkgContent = await Bun.file(pkgPath).json()
        if (pkgContent.name === 'vibora') {
          return candidate
        }
      } catch {
        // Ignore
      }
    }
  }

  return null
}

/**
 * Runs a command and waits for it to complete.
 */
async function runCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        output: stdout + stderr,
      })
    })

    proc.on('error', (err) => {
      resolve({
        success: false,
        output: err.message,
      })
    })
  })
}

export async function handleUpCommand(flags: Record<string, string>) {
  // Check if already running
  const existingPid = readPid()
  if (existingPid && isProcessRunning(existingPid)) {
    throw new CliError(
      'ALREADY_RUNNING',
      `Vibora server is already running (PID: ${existingPid})`,
      ExitCodes.ERROR
    )
  }

  const viboraRoot = await findViboraRoot()
  if (!viboraRoot) {
    throw new CliError(
      'VIBORA_NOT_FOUND',
      'Could not find Vibora project root. Run this command from the Vibora directory.',
      ExitCodes.ERROR
    )
  }

  const port = getPort(flags.port)

  // Step 1: Build frontend
  console.error('Building frontend...')
  const buildResult = await runCommand('bunx', ['vite', 'build'], viboraRoot)
  if (!buildResult.success) {
    throw new CliError('BUILD_FAILED', `Frontend build failed: ${buildResult.output}`, ExitCodes.ERROR)
  }

  // Step 2: Push database schema
  console.error('Syncing database schema...')
  const dbResult = await runCommand('bunx', ['drizzle-kit', 'push'], viboraRoot)
  if (!dbResult.success) {
    throw new CliError('DB_SYNC_FAILED', `Database sync failed: ${dbResult.output}`, ExitCodes.ERROR)
  }

  // Step 3: Start server in background
  console.error('Starting server...')
  const serverProc = spawn('bun', ['server/index.ts'], {
    cwd: viboraRoot,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: port.toString(),
    },
  })

  // Unref so parent can exit
  serverProc.unref()

  const pid = serverProc.pid
  if (!pid) {
    throw new CliError('START_FAILED', 'Failed to start server process', ExitCodes.ERROR)
  }

  // Write PID file
  writePid(pid)

  // Wait a moment for server to start, then verify
  await new Promise((resolve) => setTimeout(resolve, 1000))

  if (!isProcessRunning(pid)) {
    throw new CliError('START_FAILED', 'Server process died immediately after starting', ExitCodes.ERROR)
  }

  output({
    pid,
    port,
    url: `http://localhost:${port}`,
  })
}
