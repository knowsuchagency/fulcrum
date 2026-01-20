import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// Settings interface supporting both nested (v2) and flat (legacy) formats
interface Settings {
  _schemaVersion?: number
  // Nested format (v2)
  server?: { port?: number }
  // Legacy flat format
  port?: number
}

const DEFAULT_PORT = 7777

/**
 * Get port from settings (supports nested and flat formats)
 */
function getPortFromSettings(settings: Settings | null): number | null {
  if (!settings) return null
  // Try nested format first (v2)
  if (settings.server?.port) {
    return settings.server.port
  }
  // Fall back to flat format (legacy)
  if (settings.port) {
    return settings.port
  }
  return null
}

function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return join(homedir(), p.slice(2))
  }
  return p
}

function readSettingsFile(path: string): Settings | null {
  try {
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8')
      return JSON.parse(content)
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

/**
 * Discovers the Fulcrum server URL.
 * Priority:
 * 1. Explicit URL override (--url flag)
 * 2. Explicit port override (--port flag)
 * 3. FULCRUM_URL environment variable
 * 4. FULCRUM_DIR settings.json (read port)
 * 5. .fulcrum/settings.json in CWD (read port)
 * 6. ~/.fulcrum/settings.json (read port)
 * 7. Default: http://localhost:7777
 */
export function discoverServerUrl(urlOverride?: string, portOverride?: string): string {
  // 1. Explicit URL override
  if (urlOverride) {
    return urlOverride
  }

  // 2. Explicit port override
  if (portOverride) {
    return `http://localhost:${portOverride}`
  }

  // 3. Environment variable
  if (process.env.FULCRUM_URL) {
    return process.env.FULCRUM_URL
  }

  // 4. FULCRUM_DIR settings.json
  if (process.env.FULCRUM_DIR) {
    const fulcrumDirSettings = join(expandPath(process.env.FULCRUM_DIR), 'settings.json')
    const settings = readSettingsFile(fulcrumDirSettings)
    const port = getPortFromSettings(settings)
    if (port) {
      return `http://localhost:${port}`
    }
  }

  // 5. Local .fulcrum/settings.json
  const cwdSettings = join(process.cwd(), '.fulcrum', 'settings.json')
  const localSettings = readSettingsFile(cwdSettings)
  const localPort = getPortFromSettings(localSettings)
  if (localPort) {
    return `http://localhost:${localPort}`
  }

  // 6. Global ~/.fulcrum/settings.json
  const globalSettings = join(homedir(), '.fulcrum', 'settings.json')
  const homeSettings = readSettingsFile(globalSettings)
  const homePort = getPortFromSettings(homeSettings)
  if (homePort) {
    return `http://localhost:${homePort}`
  }

  // 7. Default
  return `http://localhost:${DEFAULT_PORT}`
}

/**
 * Updates the port in settings.json.
 * Used when --port is explicitly passed to fulcrum up.
 */
export function updateSettingsPort(port: number): void {
  const fulcrumDir = getFulcrumDir()
  const settingsPath = join(fulcrumDir, 'settings.json')

  let settings: Record<string, unknown> = {}
  try {
    if (existsSync(settingsPath)) {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    }
  } catch {
    // Start fresh if parse fails
  }

  // Ensure nested structure exists
  if (!settings.server || typeof settings.server !== 'object') {
    settings.server = {}
  }
  (settings.server as Record<string, unknown>).port = port

  // Ensure directory exists
  if (!existsSync(fulcrumDir)) {
    mkdirSync(fulcrumDir, { recursive: true })
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

/**
 * Gets the .fulcrum directory path.
 * Priority: FULCRUM_DIR env var → CWD .fulcrum → ~/.fulcrum
 */
export function getFulcrumDir(): string {
  // 1. FULCRUM_DIR env var (explicit override)
  if (process.env.FULCRUM_DIR) {
    return expandPath(process.env.FULCRUM_DIR)
  }
  // 2. CWD .fulcrum (per-worktree isolation)
  const cwdFulcrumDir = join(process.cwd(), '.fulcrum')
  if (existsSync(cwdFulcrumDir)) {
    return cwdFulcrumDir
  }
  // 3. ~/.fulcrum (default)
  return join(homedir(), '.fulcrum')
}
