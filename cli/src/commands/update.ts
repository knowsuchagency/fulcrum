import { spawn, spawnSync } from 'node:child_process'
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

function runUpdate(): Promise<number> {
  return new Promise((resolve) => {
    const { command, execCommand } = getPackageRunner()
    const args = [`${NPM_PACKAGE}@latest`, 'up']
    
    console.log(`\nRunning: ${command} ${args.join(' ')}\n`)
    
    const child = spawn(execCommand, args, {
      stdio: 'inherit',
      shell: true,
    })

    child.on('close', (code) => {
      resolve(code ?? 0)
    })

    child.on('error', (err) => {
      console.error('Failed to start update:', err.message)
      resolve(1)
    })
  })
}

export async function handleUpdateCommand(flags: Record<string, string>) {
  const checkOnly = flags.check === 'true'
  const { command } = getPackageRunner()

  if (isJsonOutput()) {
    const result = await checkForUpdates()
    output({
      ...result,
      updateCommand: `${command} ${NPM_PACKAGE}@latest up`,
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
    console.log(`\nTo update, run: ${command} ${NPM_PACKAGE}@latest up`)
    return
  }

  console.log('\nUpdating Fulcrum...')
  const exitCode = await runUpdate()
  
  if (exitCode !== 0) {
    throw new CliError('Update failed', ExitCodes.GENERAL_ERROR)
  }
}
