import { spawn, execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { output } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import { writePid, readPid, isProcessRunning, getPort } from '../utils/process'

/**
 * Check if dtach is installed
 */
function isDtachInstalled(): boolean {
  try {
    execSync('which dtach', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

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
  // Check if dtach is installed (required for terminal persistence)
  if (!isDtachInstalled()) {
    throw new CliError(
      'MISSING_DEPENDENCY',
      'dtach is required but not installed. Install it with: brew install dtach (macOS) or apt install dtach (Linux)',
      ExitCodes.ERROR
    )
  }

  // Check if already running
  const existingPid = readPid()
  if (existingPid && isProcessRunning(existingPid)) {
    throw new CliError(
      'ALREADY_RUNNING',
      `Vibora server is already running (PID: ${existingPid})`,
      ExitCodes.ERROR
    )
  }

  const port = getPort(flags.port)
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
  console.error('Starting Vibora server...')
  const serverProc = spawn('bun', [serverPath], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: port.toString(),
      VIBORA_PACKAGE_ROOT: packageRoot,
      BUN_PTY_LIB: ptyLibPath,
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
