import { Hono } from 'hono'
import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const app = new Hono()

const GITHUB_REPO = 'knowsuchagency/fulcrum'
const NPM_PACKAGE = '@knowsuchagency/fulcrum'
const CACHE_DURATION_MS = 2 * 60 * 60 * 1000

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
async function getLatestVersion({ force = false }: { force?: boolean } = {}): Promise<string | null> {
  const now = Date.now()

  // Return cached value if still valid
  if (!force && cache.latestVersion && now - cache.checkedAt < CACHE_DURATION_MS) {
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

// GET /api/version/check - Check for updates
app.get('/check', async (c) => {
  const currentVersion = process.env.FULCRUM_VERSION || null
  const forceParam = c.req.query('force')
  const force = forceParam === '1' || forceParam === 'true'
  const latestVersion = await getLatestVersion({ force })

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
}

// POST /api/version/update - Trigger update (spawns detached process and returns immediately)
app.post('/update', async (c) => {
  const currentVersion = process.env.FULCRUM_VERSION || null
  const latestVersion = await getLatestVersion({ force: true })

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
