import { Hono } from 'hono'

const app = new Hono()

const GITHUB_REPO = 'knowsuchagency/fulcrum'
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
    updateCommand: 'npx @knowsuchagency/fulcrum@latest up',
    releaseUrl: `https://github.com/${GITHUB_REPO}/releases/latest`,
  })
})

export default app
