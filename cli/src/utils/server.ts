import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// Settings interface supporting both nested (v2) and flat (legacy) formats
interface Settings {
  _schemaVersion?: number
  // Nested format (v2)
  server?: { port?: number }
  authentication?: { username?: string | null; password?: string | null }
  // Legacy flat format
  port?: number
  basicAuthUsername?: string
  basicAuthPassword?: string
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

/**
 * Get auth credentials from settings (supports nested and flat formats)
 */
function getAuthFromSettings(settings: Settings | null): { username: string; password: string } | null {
  if (!settings) return null
  // Try nested format first (v2)
  if (settings.authentication?.username && settings.authentication?.password) {
    return {
      username: settings.authentication.username,
      password: settings.authentication.password,
    }
  }
  // Fall back to flat format (legacy)
  if (settings.basicAuthUsername && settings.basicAuthPassword) {
    return {
      username: settings.basicAuthUsername,
      password: settings.basicAuthPassword,
    }
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
 * Discovers the Vibora server URL.
 * Priority:
 * 1. Explicit URL override (--url flag)
 * 2. Explicit port override (--port flag)
 * 3. VIBORA_URL environment variable
 * 4. VIBORA_DIR settings.json (read port)
 * 5. .vibora/settings.json in CWD (read port)
 * 6. ~/.vibora/settings.json (read port)
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
  if (process.env.VIBORA_URL) {
    return process.env.VIBORA_URL
  }

  // 4. VIBORA_DIR settings.json
  if (process.env.VIBORA_DIR) {
    const viboraDirSettings = join(expandPath(process.env.VIBORA_DIR), 'settings.json')
    const settings = readSettingsFile(viboraDirSettings)
    const port = getPortFromSettings(settings)
    if (port) {
      return `http://localhost:${port}`
    }
  }

  // 5. Local .vibora/settings.json
  const cwdSettings = join(process.cwd(), '.vibora', 'settings.json')
  const localSettings = readSettingsFile(cwdSettings)
  const localPort = getPortFromSettings(localSettings)
  if (localPort) {
    return `http://localhost:${localPort}`
  }

  // 6. Global ~/.vibora/settings.json
  const globalSettings = join(homedir(), '.vibora', 'settings.json')
  const homeSettings = readSettingsFile(globalSettings)
  const homePort = getPortFromSettings(homeSettings)
  if (homePort) {
    return `http://localhost:${homePort}`
  }

  // 7. Default
  return `http://localhost:${DEFAULT_PORT}`
}

/**
 * Gets the .vibora directory path.
 * Priority: VIBORA_DIR env var → CWD .vibora → ~/.vibora
 */
export function getViboraDir(): string {
  // 1. VIBORA_DIR env var (explicit override)
  if (process.env.VIBORA_DIR) {
    return expandPath(process.env.VIBORA_DIR)
  }
  // 2. CWD .vibora (per-worktree isolation)
  const cwdViboraDir = join(process.cwd(), '.vibora')
  if (existsSync(cwdViboraDir)) {
    return cwdViboraDir
  }
  // 3. ~/.vibora (default)
  return join(homedir(), '.vibora')
}

/**
 * Gets auth credentials from settings.json.
 * Supports both nested (v2) and flat (legacy) formats.
 * Priority: VIBORA_DIR → CWD .vibora → ~/.vibora
 * Returns null if no credentials are configured.
 */
export function getAuthCredentials(): { username: string; password: string } | null {
  const settingsPaths = [
    process.env.VIBORA_DIR && join(expandPath(process.env.VIBORA_DIR), 'settings.json'),
    join(process.cwd(), '.vibora', 'settings.json'),
    join(homedir(), '.vibora', 'settings.json'),
  ].filter(Boolean) as string[]

  for (const path of settingsPaths) {
    const settings = readSettingsFile(path)
    const auth = getAuthFromSettings(settings)
    if (auth) {
      return auth
    }
  }

  return null
}
