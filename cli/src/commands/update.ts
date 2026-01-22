import { defineCommand } from 'citty'
import { spawn, spawnSync } from 'node:child_process'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import { globalArgs, setupJsonOutput, toFlags } from './shared'
import { compareVersions } from '../../../shared/semver'
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

export async function checkForUpdates(): Promise<VersionCheckResult> {
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

export function installLatestVersion(): boolean {
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
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleUpdateCommand(toFlags(args))
  },
})
