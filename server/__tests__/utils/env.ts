import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resetDatabase } from '../../db'
import { resetLogFilePath } from '../../lib/logger'
import { resetDtachService } from '../../terminal/dtach-service'

/**
 * Creates an isolated test environment with its own FULCRUM_DIR.
 * Each test gets a fresh temporary directory and database.
 */
export interface TestEnv {
  /** The temporary FULCRUM_DIR path */
  fulcrumDir: string
  /** Cleanup function - removes temp directory and resets database */
  cleanup: () => void
}

/**
 * Sets up an isolated test environment.
 * Call this in beforeEach() to get a fresh environment for each test.
 */
export function setupTestEnv(): TestEnv {
  const fulcrumDir = mkdtempSync(join(tmpdir(), 'fulcrum-test-'))

  // Store original env values
  const originalFulcrumDir = process.env.FULCRUM_DIR
  const originalPort = process.env.PORT

  // Set test environment
  process.env.FULCRUM_DIR = fulcrumDir
  delete process.env.PORT // Clear to use defaults

  // Database schema is created via migrations when the db is first accessed.
  // The lazy db proxy triggers initializeDatabase() → runMigrations() on first use.

  return {
    fulcrumDir,
    cleanup: () => {
      // Reset database first (closes connections)
      resetDatabase()

      // Reset cached paths in singletons so they pick up new FULCRUM_DIR
      resetLogFilePath()
      resetDtachService()

      // Restore original env values
      // IMPORTANT: Always restore FULCRUM_DIR, never delete it.
      // Deleting FULCRUM_DIR causes getFulcrumDir() to fall back to ~/.fulcrum (production)
      // which would corrupt production settings during subsequent test operations.
      if (originalFulcrumDir !== undefined) {
        process.env.FULCRUM_DIR = originalFulcrumDir
      }
      // Note: We intentionally do NOT delete FULCRUM_DIR even if it was originally undefined.
      // In test mode, getFulcrumDir() will throw if FULCRUM_DIR is not set, which is safer
      // than silently falling back to production paths.

      if (originalPort !== undefined) {
        process.env.PORT = originalPort
      }

      // Remove temp directory
      try {
        rmSync(fulcrumDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    },
  }
}

/**
 * Helper to save and restore environment variables.
 * Useful for testing env var overrides.
 */
export function withEnv(
  envVars: Record<string, string | undefined>,
  fn: () => void | Promise<void>
): void | Promise<void> {
  const saved: Record<string, string | undefined> = {}

  // Save and set
  for (const [key, value] of Object.entries(envVars)) {
    saved[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  const restore = () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }

  try {
    const result = fn()
    if (result instanceof Promise) {
      return result.finally(restore)
    }
    restore()
  } catch (e) {
    restore()
    throw e
  }
}
