import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// ==================== Test Mode ====================
// Test mode provides a safety layer to prevent tests from accidentally
// modifying production settings files (~/.fulcrum/, ~/.claude/)

let _testMode = false

/**
 * Enable test mode - should be called from test preload script.
 * In test mode, any attempt to access production paths will throw.
 */
export function enableTestMode(): void {
  _testMode = true
}

/**
 * Check if test mode is enabled.
 */
export function isTestMode(): boolean {
  return _testMode
}

/**
 * Get the real home directory (bypasses HOME env var).
 * Used only for test isolation checks.
 */
export function getRealHomeDir(): string {
  // HOME_BACKUP is set by mise.toml before overriding HOME
  return process.env.HOME_BACKUP || os.homedir()
}

/**
 * Get home directory respecting HOME env var.
 * Use this instead of os.homedir() for all user-facing paths.
 */
export function getHomeDir(): string {
  return process.env.HOME || os.homedir()
}

/**
 * Assert that a path is not a production path during tests.
 * Throws if test mode is enabled and the path is under production ~/.fulcrum or ~/.claude
 */
export function assertNotProductionPath(p: string, context: string): void {
  if (!_testMode) return

  const realHome = getRealHomeDir()
  const productionFulcrum = path.join(realHome, '.fulcrum')
  const productionClaude = path.join(realHome, '.claude')
  const productionClaudeJson = path.join(realHome, '.claude.json')

  if (
    p.startsWith(productionFulcrum + path.sep) ||
    p === productionFulcrum ||
    p.startsWith(productionClaude + path.sep) ||
    p === productionClaude ||
    p === productionClaudeJson
  ) {
    throw new Error(`TEST ISOLATION VIOLATION in ${context}: attempted to access production path ${p}`)
  }
}

// Expand tilde in path and ensure absolute path
export function expandPath(p: string): string {
  if (!p) return p
  // Handle single tilde (just home directory)
  if (p === '~') {
    return getHomeDir()
  }
  // Handle tilde with path
  if (p.startsWith('~/')) {
    return path.join(getHomeDir(), p.slice(2))
  }
  // Convert relative paths to absolute
  if (!path.isAbsolute(p)) {
    return path.resolve(p)
  }
  return p
}

// Get the fulcrum directory path
// Priority: FULCRUM_DIR env var → CWD .fulcrum → ~/.fulcrum
export function getFulcrumDir(): string {
  // 1. FULCRUM_DIR env var (explicit override)
  if (process.env.FULCRUM_DIR) {
    const p = expandPath(process.env.FULCRUM_DIR)
    assertNotProductionPath(p, 'getFulcrumDir')
    return p
  }
  // 2. CWD .fulcrum (per-worktree isolation)
  const cwdFulcrum = path.join(process.cwd(), '.fulcrum')
  if (fs.existsSync(cwdFulcrum)) {
    assertNotProductionPath(cwdFulcrum, 'getFulcrumDir')
    return cwdFulcrum
  }
  // 3. ~/.fulcrum (default) - FAIL in test mode to prevent production access
  if (_testMode) {
    throw new Error('TEST ISOLATION VIOLATION: FULCRUM_DIR not set and no local .fulcrum directory found')
  }
  return path.join(getHomeDir(), '.fulcrum')
}

// Get database path (always derived from fulcrumDir)
export function getDatabasePath(): string {
  return path.join(getFulcrumDir(), 'fulcrum.db')
}

// Get worktree base path (always derived from fulcrumDir)
export function getWorktreeBasePath(): string {
  return path.join(getFulcrumDir(), 'worktrees')
}

// Get the settings file path
export function getSettingsPath(): string {
  return path.join(getFulcrumDir(), 'settings.json')
}

// Ensure the fulcrum directory exists
export function ensureFulcrumDir(): void {
  const fulcrumDir = getFulcrumDir()
  if (!fs.existsSync(fulcrumDir)) {
    fs.mkdirSync(fulcrumDir, { recursive: true })
  }
}

// Ensure the worktrees directory exists
export function ensureWorktreesDir(): void {
  const worktreesDir = getWorktreeBasePath()
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true })
  }
}

// Initialize all required directories and files
// Note: ensureSettingsFile is called from core.ts to avoid circular deps
export function initializeFulcrumDirectories(): void {
  ensureFulcrumDir()
  ensureWorktreesDir()
}

/**
 * Get instance context for system prompts.
 * Helps AI agents understand which Fulcrum instance they're running in.
 */
export function getInstanceContext(): string {
  const fulcrumDir = getFulcrumDir()
  const port = process.env.PORT || '7777'
  const defaultFulcrumDir = path.join(getHomeDir(), '.fulcrum')
  const isDevInstance = fulcrumDir !== defaultFulcrumDir

  let context = `## Fulcrum Instance Context

FULCRUM_DIR: ${fulcrumDir}
Server port: ${port}
Instance type: ${isDevInstance ? 'DEVELOPMENT' : 'PRODUCTION'}`

  if (isDevInstance) {
    context += `

**IMPORTANT**: You are running in a DEVELOPMENT instance.
- The production Fulcrum is at ${defaultFulcrumDir} (port 7777)
- Do NOT interact with production data or services
- All operations should stay within this instance's context`
  }

  return context
}
