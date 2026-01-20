import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { resetDatabase } from '../../db'

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

  // Push database schema to the new test database
  try {
    execSync('bun run drizzle-kit push', {
      env: { ...process.env, FULCRUM_DIR: fulcrumDir },
      stdio: 'pipe',
    })
  } catch (err) {
    // Log but don't fail - some tests may not need the database
    console.error('Failed to push database schema:', err)
  }

  return {
    fulcrumDir,
    cleanup: () => {
      // Reset database first (closes connections)
      resetDatabase()

      // Restore original env values
      if (originalFulcrumDir !== undefined) {
        process.env.FULCRUM_DIR = originalFulcrumDir
      } else {
        delete process.env.FULCRUM_DIR
      }
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
