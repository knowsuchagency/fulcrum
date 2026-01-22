import { Hono } from 'hono'
import { spawn, spawnSync } from 'node:child_process'
import { compareVersions } from '../../shared/semver'

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

/**
 * Spawn a detached CLI process to handle the update.
 * The CLI will: stop server -> install update -> start server
 */
function spawnDetachedUpdate(): void {
  const command = getPackageRunner()
  const args = command === 'bunx'
    ? ['--bun', `${NPM_PACKAGE}@latest`, 'up', '--update', '-y']
    : ['--yes', `${NPM_PACKAGE}@latest`, 'up', '--update', '-y']

  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    shell: true,
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

  spawnDetachedUpdate()

  return c.json({
    success: true,
    message: 'Update started. Server will restart momentarily.',
    fromVersion: currentVersion,
    toVersion: latestVersion,
  })
})

export default app
