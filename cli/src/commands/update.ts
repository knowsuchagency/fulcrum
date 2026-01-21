import { defineCommand } from 'citty'
import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import { globalArgs, setupJsonOutput, toFlags } from './shared'
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

function parseSemver(version: string): {
  major: number
  minor: number
  patch: number
  preRelease: Array<string | number>
} | null {
  const cleaned = version.trim().replace(/^v/, '')
  const [mainAndPre] = cleaned.split('+', 1)
  const [main, preReleaseRaw] = mainAndPre.split('-', 2)
  const parts = main.split('.')
  if (parts.length > 3 || parts.length === 0) return null

  if (parts.some((part) => part.length > 1 && part.startsWith('0'))) return null

  const major = Number(parts[0])
  const minor = Number(parts[1] ?? '0')
  const patch = Number(parts[2] ?? '0')
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return null
  if (major < 0 || minor < 0 || patch < 0) return null

  if (preReleaseRaw) {
    const preReleaseParts = preReleaseRaw.split('.')
    if (preReleaseParts.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) {
      return null
    }
  }

  const preRelease = preReleaseRaw
    ? preReleaseRaw.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part))
    : []

  return { major, minor, patch, preRelease }
}

function compareIdentifiers(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'number') return -1
  if (typeof b === 'number') return 1
  return a.localeCompare(b)
}

function compareVersions(v1: string, v2: string): number {
  const parsed1 = parseSemver(v1)
  const parsed2 = parseSemver(v2)
  if (!parsed1 || !parsed2) return 0

  if (parsed1.major !== parsed2.major) return parsed1.major - parsed2.major
  if (parsed1.minor !== parsed2.minor) return parsed1.minor - parsed2.minor
  if (parsed1.patch !== parsed2.patch) return parsed1.patch - parsed2.patch

  const pre1 = parsed1.preRelease
  const pre2 = parsed2.preRelease
  if (pre1.length === 0 && pre2.length === 0) return 0
  if (pre1.length === 0) return 1
  if (pre2.length === 0) return -1

  const maxLen = Math.max(pre1.length, pre2.length)
  for (let i = 0; i < maxLen; i++) {
    const id1 = pre1[i]
    const id2 = pre2[i]
    if (id1 === undefined) return -1
    if (id2 === undefined) return 1
    const diff = compareIdentifiers(id1, id2)
    if (diff !== 0) return diff
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
    : ['--yes', '--ignore-scripts', `${NPM_PACKAGE}@latest`, '--version']

  const result = spawnSync(execCommand, args, {
    stdio: 'inherit',
    shell: true,
  })

  if (result.status === 0) {
    console.log('Latest version installed.')
    return true
  }
  console.error('Failed to install latest version.')
  return false
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

  const installArgs = command === 'bunx' ? '--bun' : '--yes --ignore-scripts'
  const script = `#!/bin/bash
# Fulcrum self-update script - runs independently of parent process

# Wait for old server to fully stop
sleep 2

# Stop any remaining server (in case it's still running)
${command} ${NPM_PACKAGE}@latest down 2>/dev/null || true

# Install latest version (cache it)
${command} ${installArgs} ${NPM_PACKAGE}@latest --version

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
    throw new CliError('NETWORK_ERROR', 'Could not check for updates. Please check your internet connection.', ExitCodes.NETWORK_ERROR)
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
    throw new CliError('GENERAL_ERROR', 'Update failed', ExitCodes.GENERAL_ERROR)
  }

  console.log('\n✓ Fulcrum has been updated and restarted.')
}

// ============================================================================
// Command Definition
// ============================================================================

export const updateCommand = defineCommand({
  meta: {
    name: 'update',
    description: 'Check for updates and update Fulcrum to the latest version',
  },
  args: {
    ...globalArgs,
    check: {
      type: 'boolean' as const,
      description: 'Only check for updates, do not install',
    },
    background: {
      type: 'boolean' as const,
      description: 'Run update in background (for UI-triggered updates)',
    },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleUpdateCommand(toFlags(args))
  },
})
