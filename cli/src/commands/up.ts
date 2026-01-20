import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import { writePid, readPid, removePid, isProcessRunning, getPort } from '../utils/process'
import { confirm } from '../utils/prompt'
import { getFulcrumDir, updateSettingsPort, needsViboraMigration, migrateFromVibora, getLegacyViboraDir } from '../utils/server'
import {
  isDtachInstalled,
  isBunInstalled,
  installDtach,
  installBun,
  isClaudeInstalled,
  isOpencodeInstalled,
  isUvInstalled,
  installUv,
} from '../utils/install'
import { getDependency, getInstallMethod, getInstallCommand } from '../utils/dependencies'
import pkg from '../../../package.json'

/**
 * Gets the package root directory (where the CLI is installed).
 * In bundled mode, this contains server/, dist/, and drizzle/.
 *
 * Handles two cases:
 * - Development: file is at cli/src/commands/up.ts (3 levels up to cli/)
 * - Bundled: file is at bin/fulcrum.js (1 level up to package root)
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
  const autoYes = flags.yes === 'true' || flags.y === 'true'

  // Check for migration from ~/.vibora (legacy Vibora installation)
  if (needsViboraMigration()) {
    const viboraDir = getLegacyViboraDir()
    console.error(`\nFound existing Vibora data at ${viboraDir}`)
    console.error('Fulcrum (formerly Vibora) now uses ~/.fulcrum for data storage.')
    console.error('')
    console.error('Your existing data can be copied to the new location.')
    console.error('This is non-destructive - your ~/.vibora directory will be left untouched.')
    console.error('')

    const shouldMigrate = autoYes || (await confirm('Would you like to copy your data to ~/.fulcrum?'))
    if (shouldMigrate) {
      console.error('Copying data from ~/.vibora to ~/.fulcrum...')
      const success = migrateFromVibora()
      if (success) {
        console.error('Migration complete! Your data has been copied to ~/.fulcrum')
        console.error('Your original ~/.vibora directory has been preserved.')
        console.error('')
      } else {
        console.error('Migration failed. You can manually copy files from ~/.vibora to ~/.fulcrum')
        console.error('')
      }
    } else {
      console.error('Skipping migration. Fulcrum will start with a fresh data directory.')
      console.error('You can manually migrate later by copying ~/.vibora to ~/.fulcrum')
      console.error('')
    }
  }

  // Check if bun is installed (needed to run the server)
  if (!isBunInstalled()) {
    const bunDep = getDependency('bun')!
    const method = getInstallMethod(bunDep)
    console.error('Bun is required to run Fulcrum but is not installed.')
    console.error('  Bun is the JavaScript runtime that powers Fulcrum.')

    const shouldInstall = autoYes || (await confirm(`Would you like to install bun via ${method}?`))
    if (shouldInstall) {
      const success = installBun()
      if (!success) {
        throw new CliError('INSTALL_FAILED', 'Failed to install bun', ExitCodes.ERROR)
      }
      console.error('Bun installed successfully!')
    } else {
      throw new CliError(
        'MISSING_DEPENDENCY',
        `Bun is required. Install manually: ${getInstallCommand(bunDep)}`,
        ExitCodes.ERROR
      )
    }
  }

  // Check if dtach is installed (required for terminal persistence)
  if (!isDtachInstalled()) {
    const dtachDep = getDependency('dtach')!
    const method = getInstallMethod(dtachDep)
    console.error('dtach is required for terminal persistence but is not installed.')
    console.error('  dtach enables persistent terminal sessions that survive disconnects.')

    const shouldInstall = autoYes || (await confirm(`Would you like to install dtach via ${method}?`))
    if (shouldInstall) {
      const success = installDtach()
      if (!success) {
        throw new CliError('INSTALL_FAILED', 'Failed to install dtach', ExitCodes.ERROR)
      }
      console.error('dtach installed successfully!')
    } else {
      throw new CliError(
        'MISSING_DEPENDENCY',
        `dtach is required. Install manually: ${getInstallCommand(dtachDep)}`,
        ExitCodes.ERROR
      )
    }
  }

  // Check if uv is installed (required for Python package management)
  if (!isUvInstalled()) {
    const uvDep = getDependency('uv')!
    const method = getInstallMethod(uvDep)
    console.error('uv is required but is not installed.')
    console.error('  uv is a fast Python package manager used by Claude Code.')

    const shouldInstall = autoYes || (await confirm(`Would you like to install uv via ${method}?`))
    if (shouldInstall) {
      const success = installUv()
      if (!success) {
        throw new CliError('INSTALL_FAILED', 'Failed to install uv', ExitCodes.ERROR)
      }
      console.error('uv installed successfully!')
    } else {
      throw new CliError(
        'MISSING_DEPENDENCY',
        `uv is required. Install manually: ${getInstallCommand(uvDep)}`,
        ExitCodes.ERROR
      )
    }
  }

  // Check if already running
  const existingPid = readPid()
  if (existingPid && isProcessRunning(existingPid)) {
    console.error(`Fulcrum server is already running (PID: ${existingPid})`)

    const shouldReplace = autoYes || (await confirm('Would you like to stop it and start a new instance?'))
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

  // Persist port to settings.json when explicitly passed
  if (flags.port) {
    updateSettingsPort(port)
  }

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
  // Explicitly set FULCRUM_DIR to ensure consistent path resolution
  // regardless of where the CLI was invoked from
  const fulcrumDir = getFulcrumDir()
  const debug = flags.debug === 'true'
  console.error(`Starting Fulcrum server${debug ? ' (debug mode)' : ''}...`)
  const serverProc = spawn('bun', [serverPath], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: port.toString(),
      HOST: host,
      FULCRUM_DIR: fulcrumDir,
      FULCRUM_PACKAGE_ROOT: packageRoot,
      FULCRUM_VERSION: pkg.version,
      BUN_PTY_LIB: ptyLibPath,
      // Pass CLI's alias-aware detection to the server (which can't detect aliases)
      ...(isClaudeInstalled() && { FULCRUM_CLAUDE_INSTALLED: '1' }),
      ...(isOpencodeInstalled() && { FULCRUM_OPENCODE_INSTALLED: '1' }),
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

  if (isJsonOutput()) {
    output({
      pid,
      port,
      url: `http://localhost:${port}`,
    })
  } else {
    // Show getting started tips for human-readable output
    const hasAgent = isClaudeInstalled() || isOpencodeInstalled()
    showGettingStartedTips(port, hasAgent)
  }
}

/**
 * Display getting started tips after successful server start.
 */
function showGettingStartedTips(port: number, hasAgent: boolean): void {
  console.error(`
Fulcrum is running at http://localhost:${port}

Getting Started:
  1. Open http://localhost:${port} in your browser
  2. Add a repository to get started
  3. Create a task to spin up an isolated worktree
  4. Run your AI agent in the task terminal

Commands:
  fulcrum status    Check server status
  fulcrum doctor    Check all dependencies
  fulcrum down      Stop the server
`)

  if (!hasAgent) {
    console.error(`Note: No AI agents detected. Install one to get started:
  Claude Code: curl -fsSL https://claude.ai/install.sh | bash
  OpenCode:    curl -fsSL https://opencode.ai/install | bash
`)
  }
}
