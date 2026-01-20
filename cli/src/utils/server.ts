import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync } from 'node:fs'
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

/**
 * Gets the legacy .vibora directory path.
 */
export function getLegacyViboraDir(): string {
  return join(homedir(), '.vibora')
}

/**
 * Checks if migration from ~/.vibora is needed.
 * Returns true if:
 * - ~/.vibora exists and has contents
 * - ~/.fulcrum either doesn't exist or is empty
 */
export function needsViboraMigration(): boolean {
  const viboraDir = getLegacyViboraDir()
  const fulcrumDir = join(homedir(), '.fulcrum')

  // Check if ~/.vibora exists and has contents
  if (!existsSync(viboraDir)) {
    return false
  }

  try {
    const viboraContents = readdirSync(viboraDir)
    if (viboraContents.length === 0) {
      return false
    }
  } catch {
    return false
  }

  // Check if ~/.fulcrum already exists with contents
  if (existsSync(fulcrumDir)) {
    try {
      const fulcrumContents = readdirSync(fulcrumDir)
      // Only skip if fulcrum has meaningful content (not just empty or minimal)
      if (fulcrumContents.length > 0) {
        return false
      }
    } catch {
      // If we can't read it, assume we don't need to migrate
      return false
    }
  }

  return true
}

/**
 * Migrates data from ~/.vibora to ~/.fulcrum.
 * This is non-destructive - it copies data without deleting the original.
 * Returns true if migration was successful.
 */
export function migrateFromVibora(): boolean {
  const viboraDir = getLegacyViboraDir()
  const fulcrumDir = join(homedir(), '.fulcrum')

  try {
    // Ensure ~/.fulcrum exists
    if (!existsSync(fulcrumDir)) {
      mkdirSync(fulcrumDir, { recursive: true })
    }

    // Copy all contents from ~/.vibora to ~/.fulcrum
    cpSync(viboraDir, fulcrumDir, { recursive: true })

    // Update any remaining vibora references in settings.json
    const settingsPath = join(fulcrumDir, 'settings.json')
    if (existsSync(settingsPath)) {
      try {
        let content = readFileSync(settingsPath, 'utf-8')
        // Replace any .vibora paths with .fulcrum
        content = content.replace(/\.vibora/g, '.fulcrum')
        content = content.replace(/vibora\.(db|log|pid)/g, 'fulcrum.$1')
        writeFileSync(settingsPath, content, 'utf-8')
      } catch {
        // Settings update is optional, continue anyway
      }
    }

    // Rename database file if it exists
    const oldDbPath = join(fulcrumDir, 'vibora.db')
    const newDbPath = join(fulcrumDir, 'fulcrum.db')
    if (existsSync(oldDbPath) && !existsSync(newDbPath)) {
      cpSync(oldDbPath, newDbPath)
      // Also copy WAL and SHM files if they exist
      const walPath = oldDbPath + '-wal'
      const shmPath = oldDbPath + '-shm'
      if (existsSync(walPath)) cpSync(walPath, newDbPath + '-wal')
      if (existsSync(shmPath)) cpSync(shmPath, newDbPath + '-shm')
    }

    // Rename log file if it exists
    const oldLogPath = join(fulcrumDir, 'vibora.log')
    const newLogPath = join(fulcrumDir, 'fulcrum.log')
    if (existsSync(oldLogPath) && !existsSync(newLogPath)) {
      cpSync(oldLogPath, newLogPath)
    }

    return true
  } catch (err) {
    console.error('Migration failed:', err instanceof Error ? err.message : String(err))
    return false
  }
}
