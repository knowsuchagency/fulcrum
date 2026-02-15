import { existsSync, mkdirSync, cpSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { homedir } from 'node:os'

const DEFAULT_PORT = 7777

function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return join(homedir(), p.slice(2))
  }
  return p
}

/**
 * Get port from fnox config in a given directory.
 * Uses fnox CLI directly (no server dependency).
 */
function getPortFromFnox(fulcrumDir: string): number | null {
  const fnoxConfigPath = join(fulcrumDir, 'fnox.toml')
  const ageKeyPath = join(fulcrumDir, 'age.txt')

  if (!existsSync(fnoxConfigPath) || !existsSync(ageKeyPath)) return null

  try {
    const value = execSync(
      `fnox get FULCRUM_SERVER_PORT -c "${fnoxConfigPath}" --if-missing ignore`,
      {
        env: { ...process.env, FNOX_AGE_KEY_FILE: ageKeyPath },
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }
    ).trim()
    if (value) {
      const port = parseInt(value, 10)
      if (!isNaN(port) && port > 0) return port
    }
  } catch {
    // fnox not available or key not set
  }
  return null
}

/**
 * Discovers the Fulcrum server URL.
 * Priority:
 * 1. Explicit URL override (--url flag)
 * 2. Explicit port override (--port flag)
 * 3. FULCRUM_URL environment variable
 * 4. FULCRUM_DIR fnox.toml (read port)
 * 5. .fulcrum/fnox.toml in CWD (read port)
 * 6. ~/.fulcrum/fnox.toml (read port)
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

  // 4. FULCRUM_DIR fnox.toml
  if (process.env.FULCRUM_DIR) {
    const port = getPortFromFnox(expandPath(process.env.FULCRUM_DIR))
    if (port) return `http://localhost:${port}`
  }

  // 5. Local .fulcrum/fnox.toml
  const cwdFulcrum = join(process.cwd(), '.fulcrum')
  if (existsSync(cwdFulcrum)) {
    const port = getPortFromFnox(cwdFulcrum)
    if (port) return `http://localhost:${port}`
  }

  // 6. Global ~/.fulcrum/fnox.toml
  const globalFulcrum = join(homedir(), '.fulcrum')
  const port = getPortFromFnox(globalFulcrum)
  if (port) return `http://localhost:${port}`

  // 7. Default
  return `http://localhost:${DEFAULT_PORT}`
}

/**
 * Updates the port in fnox config.
 * Used when --port is explicitly passed to fulcrum up.
 */
export function updateSettingsPort(port: number): void {
  const fulcrumDir = getFulcrumDir()
  const fnoxConfigPath = join(fulcrumDir, 'fnox.toml')
  const ageKeyPath = join(fulcrumDir, 'age.txt')

  // Ensure directory exists
  if (!existsSync(fulcrumDir)) {
    mkdirSync(fulcrumDir, { recursive: true })
  }

  if (!existsSync(fnoxConfigPath) || !existsSync(ageKeyPath)) {
    // fnox not set up yet — will be set up by ensureFnoxSetup
    return
  }

  try {
    execSync(
      `fnox set FULCRUM_SERVER_PORT -p plain -c "${fnoxConfigPath}"`,
      {
        env: { ...process.env, FNOX_AGE_KEY_FILE: ageKeyPath },
        input: String(port),
        stdio: ['pipe', 'ignore', 'ignore'],
      }
    )
  } catch {
    // Best effort — server will use default port
  }
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
 * - ~/.vibora/vibora.db exists
 * - ~/.fulcrum/fulcrum.db doesn't exist
 */
export function needsViboraMigration(): boolean {
  const viboraDir = getLegacyViboraDir()
  const fulcrumDir = join(homedir(), '.fulcrum')

  const viboraDbPath = join(viboraDir, 'vibora.db')
  const fulcrumDbPath = join(fulcrumDir, 'fulcrum.db')

  // Check if ~/.vibora/vibora.db exists
  if (!existsSync(viboraDbPath)) {
    return false
  }

  // Migration needed if fulcrum.db doesn't exist yet
  return !existsSync(fulcrumDbPath)
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
