import { Hono } from 'hono'
import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const app = new Hono()

const GITHUB_REPO = 'knowsuchagency/fulcrum'
const NPM_PACKAGE = '@knowsuchagency/fulcrum'
const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

interface VersionCache {
  latestVersion: string | null
  checkedAt: number
}

let cache: VersionCache = {
  latestVersion: null,
  checkedAt: 0,
}

/**
 * Fetch latest version from npm registry
 * Using npm is more reliable than GitHub API (no rate limits)
 */
async function fetchLatestVersionFromNpm(): Promise<string | null> {
  try {
    const response = await fetch('https://registry.npmjs.org/@knowsuchagency/fulcrum/latest', {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    const data = await response.json()
    return data.version || null
  } catch {
    return null
  }
}

/**
 * Fetch latest version from GitHub releases as fallback
 */
async function fetchLatestVersionFromGitHub(): Promise<string | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    })
    if (!response.ok) return null
    const data = await response.json()
    // tag_name is usually "v1.2.3" or "1.2.3"
    const tagName = data.tag_name as string
    return tagName?.replace(/^v/, '') || null
  } catch {
    return null
  }
}

/**
 * Get the latest version with caching
 */
async function getLatestVersion(): Promise<string | null> {
  const now = Date.now()

  // Return cached value if still valid
  if (cache.latestVersion && now - cache.checkedAt < CACHE_DURATION_MS) {
    return cache.latestVersion
  }

  // Try npm first, then GitHub as fallback
  let latestVersion = await fetchLatestVersionFromNpm()
  if (!latestVersion) {
    latestVersion = await fetchLatestVersionFromGitHub()
  }

  if (latestVersion) {
    cache = { latestVersion, checkedAt: now }
  }

  return latestVersion
}

/**
 * Compare two semantic versions
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
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

// GET /api/version/check - Check for updates
app.get('/check', async (c) => {
  const currentVersion = process.env.FULCRUM_VERSION || null
  const latestVersion = await getLatestVersion()

  let updateAvailable = false
  if (currentVersion && latestVersion) {
    updateAvailable = compareVersions(latestVersion, currentVersion) > 0
  }

  return c.json({
    currentVersion,
    latestVersion,
    updateAvailable,
    updateCommand: 'fulcrum update',
    releaseUrl: `https://github.com/${GITHUB_REPO}/releases/latest`,
  })
})

function isBunAvailable(): boolean {
  try {
    const result = spawnSync('bun', ['--version'], { stdio: 'pipe' })
    return result.status === 0
  } catch {
    return false
  }
}

function getPackageRunner(): string {
  return isBunAvailable() ? 'bunx' : 'npx'
}

function spawnDetachedUpdateScript(): void {
  const command = getPackageRunner()
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
}

// POST /api/version/update - Trigger update (spawns detached process and returns immediately)
app.post('/update', async (c) => {
  const currentVersion = process.env.FULCRUM_VERSION || null
  const latestVersion = await getLatestVersion()

  if (!latestVersion) {
    return c.json({ success: false, error: 'Could not fetch latest version' }, 503)
  }

  if (currentVersion && compareVersions(latestVersion, currentVersion) <= 0) {
    return c.json({ success: false, error: 'Already on latest version' }, 400)
  }

  spawnDetachedUpdateScript()

  return c.json({ 
    success: true, 
    message: 'Update started. Server will restart momentarily.',
    fromVersion: currentVersion,
    toVersion: latestVersion,
  })
})

export default app
