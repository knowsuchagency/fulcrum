import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { readdirSync } from 'node:fs'
import * as schema from './schema'
import { initializeViboraDirectories, getDatabasePath } from '../lib/settings'

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

  // Run migrations in bundled mode (CLI)
  runBundledMigrations(_sqlite, _db)

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

// Run migrations in bundled mode (lazy, called after db initialization)
function runBundledMigrations(sqlite: Database, drizzleDb: BunSQLiteDatabase<typeof schema>): void {
  if (!process.env.VIBORA_PACKAGE_ROOT) return

  const migrationsPath = join(process.env.VIBORA_PACKAGE_ROOT, 'drizzle')

  // Check if this is a database created with drizzle-kit push (has tables but no migrations recorded).
  // If so, mark existing migrations as applied to avoid "table already exists" errors.
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
      // Database was created with drizzle-kit push - mark all migrations as applied
      const files = readdirSync(migrationsPath).filter((f: string) => f.endsWith('.sql')).sort()
      for (const file of files) {
        const hash = file.replace('.sql', '')
        sqlite.exec(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('${hash}', ${Date.now()})`)
      }
    }
  }

  migrate(drizzleDb, { migrationsFolder: migrationsPath })
}

// Re-export schema for convenience
export * from './schema'
