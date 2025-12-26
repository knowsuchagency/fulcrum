import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { output } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import { writePid, readPid, removePid, isProcessRunning, getPort } from '../utils/process'
import { confirm } from '../utils/prompt'
import { getViboraDir } from '../utils/server'
import {
  isDtachInstalled,
  isBunInstalled,
  isBrewInstalled,
  installDtach,
  installBun,
} from '../utils/install'

/**
 * Gets the package root directory (where the CLI is installed).
 * In bundled mode, this contains server/, dist/, and drizzle/.
 *
 * Handles two cases:
 * - Development: file is at cli/src/commands/up.ts (3 levels up to cli/)
 * - Bundled: file is at bin/vibora.js (1 level up to package root)
 */
function getPackageRoot(): string {
  const currentFile = fileURLToPath(import.meta.url)
  let dir = dirname(currentFile)

  // Walk up directories until we find one with server/index.js
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'server', 'index.js'))) {
      return dir
    }
    dir = dirname(dir)
  }

  // Fallback to old behavior (3 levels up)
  return dirname(dirname(dirname(currentFile)))
}

export async function handleUpCommand(flags: Record<string, string>) {
  // Check if bun is installed (needed to run the server)
  if (!isBunInstalled()) {
    const hasBrew = isBrewInstalled()
    const method = hasBrew ? 'Homebrew' : 'curl script'
    console.error('Bun is required to run Vibora but is not installed.')

    const shouldInstall = await confirm(`Would you like to install bun via ${method}?`)
    if (shouldInstall) {
      const success = installBun()
      if (!success) {
        throw new CliError('INSTALL_FAILED', 'Failed to install bun', ExitCodes.ERROR)
      }
      console.error('Bun installed successfully!')
    } else {
      throw new CliError(
        'MISSING_DEPENDENCY',
        'Bun is required. Install manually: brew install oven-sh/bun/bun (macOS) or curl -fsSL https://bun.sh/install | bash',
        ExitCodes.ERROR
      )
    }
  }

  // Check if dtach is installed (required for terminal persistence)
  if (!isDtachInstalled()) {
    const hasBrew = isBrewInstalled()
    const method = hasBrew ? 'Homebrew' : 'apt'
    console.error('dtach is required for terminal persistence but is not installed.')

    const shouldInstall = await confirm(`Would you like to install dtach via ${method}?`)
    if (shouldInstall) {
      const success = installDtach()
      if (!success) {
        throw new CliError('INSTALL_FAILED', 'Failed to install dtach', ExitCodes.ERROR)
      }
      console.error('dtach installed successfully!')
    } else {
      throw new CliError(
        'MISSING_DEPENDENCY',
        'dtach is required. Install manually: brew install dtach (macOS) or apt install dtach (Linux)',
        ExitCodes.ERROR
      )
    }
  }

  // Check if already running
  const existingPid = readPid()
  if (existingPid && isProcessRunning(existingPid)) {
    console.error(`Vibora server is already running (PID: ${existingPid})`)

    const shouldReplace = await confirm('Would you like to stop it and start a new instance?')
    if (shouldReplace) {
      console.error('Stopping existing instance...')
      process.kill(existingPid, 'SIGTERM')

      // Wait for process to exit (up to 5 seconds)
      let attempts = 0
      while (attempts < 50 && isProcessRunning(existingPid)) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        attempts++
      }

      // Force kill if still running
      if (isProcessRunning(existingPid)) {
        process.kill(existingPid, 'SIGKILL')
      }

      removePid()
      console.error('Existing instance stopped.')
    } else {
      throw new CliError(
        'ALREADY_RUNNING',
        `Server already running at http://localhost:${getPort(flags.port)}`,
        ExitCodes.ERROR
      )
    }
  }

  const port = getPort(flags.port)
  const host = flags.host ? '0.0.0.0' : 'localhost'
  const packageRoot = getPackageRoot()
  const serverPath = join(packageRoot, 'server', 'index.js')

  // Select correct PTY library based on platform
  const platform = process.platform
  const arch = process.arch
  let ptyLibName: string
  if (platform === 'darwin') {
    ptyLibName = arch === 'arm64' ? 'librust_pty_arm64.dylib' : 'librust_pty.dylib'
  } else if (platform === 'win32') {
    ptyLibName = 'rust_pty.dll'
  } else {
    ptyLibName = arch === 'arm64' ? 'librust_pty_arm64.so' : 'librust_pty.so'
  }
  const ptyLibPath = join(packageRoot, 'lib', ptyLibName)

  // Start the bundled server
  // Explicitly set VIBORA_DIR to ensure consistent path resolution
  // regardless of where the CLI was invoked from
  const viboraDir = getViboraDir()
  const debug = flags.debug === 'true'
  console.error(`Starting Vibora server${debug ? ' (debug mode)' : ''}...`)
  const serverProc = spawn('bun', [serverPath], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: port.toString(),
      HOST: host,
      VIBORA_DIR: viboraDir,
      VIBORA_PACKAGE_ROOT: packageRoot,
      BUN_PTY_LIB: ptyLibPath,
      ...(debug && { LOG_LEVEL: 'debug', DEBUG: '1' }),
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
