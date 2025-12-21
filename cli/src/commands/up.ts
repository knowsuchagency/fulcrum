import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { output } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import { writePid, readPid, isProcessRunning, getPort } from '../utils/process'

/**
 * Gets the package root directory (where the CLI is installed).
 * In bundled mode, this contains server/, dist/, and drizzle/.
 */
function getPackageRoot(): string {
  // This file is at: cli/src/commands/up.ts (or cli/src/commands/up.js when bundled)
  // Package root is 3 levels up: commands -> src -> cli (package root)
  const currentFile = fileURLToPath(import.meta.url)
  return dirname(dirname(dirname(currentFile)))
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

  const port = getPort(flags.port)
  const packageRoot = getPackageRoot()
  const serverPath = join(packageRoot, 'server', 'index.js')
  const ptyLibPath = join(packageRoot, 'lib', 'librust_pty.so')

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
