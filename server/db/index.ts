import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { Database } from 'bun:sqlite'
import { join, dirname } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import * as schema from './schema'
import { initializeViboraDirectories, getDatabasePath } from '../lib/settings'
import { log } from '../lib/logger'

// Lazy-initialized database instance
let _db: BunSQLiteDatabase<typeof schema> | null = null
let _sqlite: Database | null = null

// Initialize and return the database (lazy initialization)
function initializeDatabase(): BunSQLiteDatabase<typeof schema> {
  if (_db) return _db

  // Initialize all vibora directories (data dir, worktrees, etc.)
  initializeViboraDirectories()

  const dbPath = getDatabasePath()

  _sqlite = new Database(dbPath)

  // Enable WAL mode for better performance
  _sqlite.exec('PRAGMA journal_mode = WAL')

  _db = drizzle(_sqlite, { schema })

  // Run migrations (works for both source and bundled mode)
  runMigrations(_sqlite, _db)

  return _db
}

// Export a proxy that lazily initializes the database on first access
// This allows tests to set VIBORA_DIR before the database is initialized
export const db = new Proxy({} as BunSQLiteDatabase<typeof schema>, {
  get(_, prop) {
    const instance = initializeDatabase()
    const value = instance[prop as keyof typeof instance]
    if (typeof value === 'function') {
      return value.bind(instance)
    }
    return value
  },
})

// For testing: reset the database instance so a new one can be created
export function resetDatabase(): void {
  if (_sqlite) {
    _sqlite.close()
  }
  _db = null
  _sqlite = null
}

// For testing: get the underlying SQLite instance
export function getSqlite(): Database | null {
  return _sqlite
}

// Run migrations (works for both source and bundled mode)
function runMigrations(sqlite: Database, drizzleDb: BunSQLiteDatabase<typeof schema>): void {
  // Determine migrations path based on mode
  let migrationsPath: string

  if (process.env.VIBORA_PACKAGE_ROOT) {
    // Bundled mode (CLI/desktop)
    migrationsPath = join(process.env.VIBORA_PACKAGE_ROOT, 'drizzle')
  } else {
    // Source mode (development)
    const serverDir = dirname(import.meta.dir)
    const projectRoot = dirname(serverDir)
    migrationsPath = join(projectRoot, 'drizzle')
  }

  if (!existsSync(migrationsPath)) {
    log.db.warn('Migrations folder not found', { migrationsPath })
    return
  }

  // Check if this is a database created with drizzle-kit push (has tables but no migrations recorded).
  // If so, mark migrations as applied based on actual schema state to avoid duplicate errors.
  const hasTasksTable = sqlite
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'")
    .get()

  if (hasTasksTable) {
    // Ensure migrations table exists
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric
      )
    `)

    // Check which migrations need to be marked as applied based on schema state.
    // This handles both fresh push-created databases and databases with partial/stale migration records.
    const journalPath = join(migrationsPath, 'meta', '_journal.json')
    if (!existsSync(journalPath)) {
      log.db.warn('Migration journal not found', { journalPath })
      // Let drizzle handle it
    } else {
      const journal = JSON.parse(readFileSync(journalPath, 'utf-8')) as {
        entries: Array<{ tag: string; when: number }>
      }

      // Get existing migration records
      const existingMigrations = sqlite
        .query('SELECT hash, created_at FROM __drizzle_migrations')
        .all() as Array<{ hash: string; created_at: number }>
      const existingHashes = new Set(existingMigrations.map((m) => m.hash))

      // Check for various schema landmarks to determine which migrations should be marked
      const hasClaudeOptions = sqlite
        .query("SELECT name FROM pragma_table_info('tasks') WHERE name='claude_options'")
        .get()
      const hasAppsTable = sqlite
        .query("SELECT name FROM sqlite_master WHERE type='table' AND name='apps'")
        .get()
      const hasEnvironmentVariables = sqlite
        .query("SELECT name FROM pragma_table_info('apps') WHERE name='environment_variables'")
        .get()
      const hasNotificationsEnabled = sqlite
        .query("SELECT name FROM pragma_table_info('apps') WHERE name='notifications_enabled'")
        .get()

      // Determine which migrations should be marked as applied based on schema state
      const migrationsToMark: Array<{ tag: string; when: number }> = []

      for (const entry of journal.entries) {
        // Skip if already recorded
        if (existingHashes.has(entry.tag)) continue

        let shouldMark = false

        // 0013 adds claude_options
        if (entry.tag < '0013_replace_system_prompt_with_claude_options') {
          shouldMark = true
        } else if (entry.tag.startsWith('0013') && hasClaudeOptions) {
          shouldMark = true
        }
        // 0014 creates apps/deployments/app_services tables
        else if (entry.tag.startsWith('0014') && hasAppsTable) {
          shouldMark = true
        }
        // 0015 adds environment_variables to apps
        else if (entry.tag.startsWith('0015') && hasEnvironmentVariables) {
          shouldMark = true
        }
        // 0016 adds notifications_enabled to apps
        else if (entry.tag.startsWith('0016') && hasNotificationsEnabled) {
          shouldMark = true
        }

        if (shouldMark) {
          migrationsToMark.push(entry)
        }
      }

      // Insert missing migrations with their own timestamps.
      // Drizzle uses hash matching (not timestamp comparison) for already-recorded migrations,
      // so we just need to insert the correct hash values.
      for (const { tag, when } of migrationsToMark) {
        sqlite.exec(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('${tag}', ${when})`)
      }

      if (migrationsToMark.length > 0) {
        log.db.info('Marked migrations as applied based on schema state', {
          count: migrationsToMark.length,
          migrations: migrationsToMark.map((m) => m.tag),
        })
      }
    }
  }

  migrate(drizzleDb, { migrationsFolder: migrationsPath })
}

// Re-export schema for convenience
export * from './schema'
