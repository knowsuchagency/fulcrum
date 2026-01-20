import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync, unlinkSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import pkg from '../../../package.json'

const GITHUB_REPO = 'knowsuchagency/fulcrum'
const NPM_PACKAGE = '@knowsuchagency/fulcrum'

interface VersionCheckResult {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
}

async function fetchLatestVersionFromNpm(): Promise<string | null> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${NPM_PACKAGE}/latest`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    const data = await response.json()
    return data.version || null
  } catch {
    return null
  }
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 > p2) return 1
    if (p1 < p2) return -1
  }
  return 0
}

async function checkForUpdates(): Promise<VersionCheckResult> {
  const currentVersion = pkg.version
  const latestVersion = await fetchLatestVersionFromNpm()

  let updateAvailable = false
  if (latestVersion) {
    updateAvailable = compareVersions(latestVersion, currentVersion) > 0
  }

  return { currentVersion, latestVersion, updateAvailable }
}

function isBunAvailable(): boolean {
  try {
    const result = spawnSync('bun', ['--version'], { stdio: 'pipe' })
    return result.status === 0
  } catch {
    return false
  }
}

function getPackageRunner(): { command: string; execCommand: string } {
  if (isBunAvailable()) {
    return { command: 'bunx', execCommand: 'bunx' }
  }
  return { command: 'npx', execCommand: 'npx' }
}

function stopServer(): void {
  const { execCommand } = getPackageRunner()
  console.log('Stopping current server...')
  
  const result = spawnSync(execCommand, [`${NPM_PACKAGE}@latest`, 'down'], {
    stdio: 'inherit',
    shell: true,
  })
  
  if (result.status === 0) {
    console.log('Server stopped.')
  } else {
    console.log('Server was not running (or already stopped).')
  }
}

function installLatestVersion(): boolean {
  const { execCommand, command } = getPackageRunner()
  console.log(`\nInstalling latest version via ${command}...`)
  
  const args = command === 'bunx' 
    ? ['--bun', `${NPM_PACKAGE}@latest`, '--version']
    : ['--yes', `${NPM_PACKAGE}@latest`, '--version']
  
  const result = spawnSync(execCommand, args, {
    stdio: 'inherit',
    shell: true,
  })
  
  if (result.status === 0) {
    console.log('Latest version installed.')
    return true
  } else {
    console.error('Failed to install latest version.')
    return false
  }
}

function startServer(): Promise<number> {
  return new Promise((resolve) => {
    const { command, execCommand } = getPackageRunner()
    const args = [`${NPM_PACKAGE}@latest`, 'up']
    
    console.log(`\nStarting server: ${command} ${args.join(' ')}\n`)
    
    const child = spawn(execCommand, args, {
      stdio: 'inherit',
      shell: true,
    })

    child.on('close', (code) => {
      resolve(code ?? 0)
    })

    child.on('error', (err) => {
      console.error('Failed to start server:', err.message)
      resolve(1)
    })
  })
}

/**
 * Spawn a detached update script that survives parent process death.
 * Used when triggered from UI - the server calling this will die during update.
 */
function spawnDetachedUpdate(): void {
  const { command } = getPackageRunner()
  const scriptPath = join(tmpdir(), `fulcrum-update-${Date.now()}.sh`)
  
  const script = `#!/bin/bash
# Fulcrum self-update script - runs independently of parent process

# Wait for old server to fully stop
sleep 2

# Stop any remaining server (in case it's still running)
${command} ${NPM_PACKAGE}@latest down 2>/dev/null || true

# Install latest version (cache it)
${command} ${command === 'bunx' ? '--bun' : '--yes'} ${NPM_PACKAGE}@latest --version

# Start new server
${command} ${NPM_PACKAGE}@latest up

# Clean up this script
rm -f "${scriptPath}"
`

  writeFileSync(scriptPath, script)
  chmodSync(scriptPath, 0o755)
  
  const child = spawn('nohup', [scriptPath], {
    detached: true,
    stdio: 'ignore',
    shell: false,
  })
  
  child.unref()
  
  console.log('Update process spawned in background.')
  console.log('The server will restart momentarily with the new version.')
}

async function runUpdate(): Promise<number> {
  stopServer()
  
  const installed = installLatestVersion()
  if (!installed) {
    console.error('\nUpdate failed during installation. Your previous version may still work.')
    console.log('Try running: fulcrum up')
    return 1
  }
  
  console.log('\nStarting updated server...')
  return await startServer()
}

export async function handleUpdateCommand(flags: Record<string, string>) {
  const checkOnly = flags.check === 'true'
  const background = flags.background === 'true'
  const { command } = getPackageRunner()

  if (isJsonOutput()) {
    const result = await checkForUpdates()
    output({
      ...result,
      updateCommand: 'fulcrum update',
      releaseUrl: `https://github.com/${GITHUB_REPO}/releases/latest`,
    })
    return
  }

  console.log('Checking for updates...')
  const { currentVersion, latestVersion, updateAvailable } = await checkForUpdates()

  if (!latestVersion) {
    throw new CliError('Could not check for updates. Please check your internet connection.', ExitCodes.NETWORK_ERROR)
  }

  console.log(`Current version: ${currentVersion}`)
  console.log(`Latest version:  ${latestVersion}`)

  if (!updateAvailable) {
    console.log('\n✓ You are running the latest version.')
    return
  }

  console.log(`\n↑ Update available: ${currentVersion} → ${latestVersion}`)

  if (checkOnly) {
    console.log(`\nTo update, run: fulcrum update`)
    console.log(`Or manually: ${command} ${NPM_PACKAGE}@latest up`)
    return
  }

  if (background) {
    console.log('\nSpawning background update process...')
    spawnDetachedUpdate()
    return
  }

  console.log('\nUpdating Fulcrum...')
  console.log('This will stop the current server, install the update, and restart.\n')
  
  const exitCode = await runUpdate()
  
  if (exitCode !== 0) {
    throw new CliError('Update failed', ExitCodes.GENERAL_ERROR)
  }
  
  console.log('\n✓ Fulcrum has been updated and restarted.')
}
