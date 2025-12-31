import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { Database } from 'bun:sqlite'
import { join, dirname } from 'node:path'
import { readdirSync, existsSync } from 'node:fs'
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

    // Check if any migrations are recorded
    const migrationCount = sqlite.query('SELECT COUNT(*) as count FROM __drizzle_migrations').get() as { count: number }

    if (migrationCount.count === 0) {
      // Database has tables but no migrations recorded. This can happen when:
      // 1. Database was created with drizzle-kit push (test databases)
      // 2. Migrations table was lost/reset
      //
      // We need to mark migrations as applied ONLY if their changes are already in the schema.
      // Check if the schema matches the LATEST migration state (has claude_options, no system_prompt_addition)
      const hasClaudeOptions = sqlite
        .query("SELECT name FROM pragma_table_info('tasks') WHERE name='claude_options'")
        .get()

      const files = readdirSync(migrationsPath).filter((f: string) => f.endsWith('.sql')).sort()

      if (hasClaudeOptions) {
        // Schema is fully up-to-date (created with push from latest schema)
        // Mark all migrations as applied and skip migrate()
        for (const file of files) {
          const hash = file.replace('.sql', '')
          sqlite.exec(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('${hash}', ${Date.now()})`)
        }
        log.db.info('Database created via push, marked all migrations as applied', { count: files.length })
        return
      } else {
        // Schema is outdated - only mark old migrations as applied, let new ones run
        // Find migrations that predate the schema change (0013 adds claude_options)
        for (const file of files) {
          const hash = file.replace('.sql', '')
          // Only mark migrations before 0013 as applied
          if (hash < '0013_replace_system_prompt_with_claude_options') {
            sqlite.exec(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('${hash}', ${Date.now()})`)
          }
        }
        log.db.info('Legacy database detected, marked pre-0013 migrations as applied')
      }
    }
  }

  migrate(drizzleDb, { migrationsFolder: migrationsPath })
}

// Re-export schema for convenience
export * from './schema'
