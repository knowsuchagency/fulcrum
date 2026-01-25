import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { Database } from 'bun:sqlite'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import * as schema from './schema'
import { initializeFulcrumDirectories, getDatabasePath } from '../lib/settings'
import { log } from '../lib/logger'

// Lazy-initialized database instance
let _db: BunSQLiteDatabase<typeof schema> | null = null
let _sqlite: Database | null = null

// Initialize and return the database (lazy initialization)
function initializeDatabase(): BunSQLiteDatabase<typeof schema> {
  if (_db) return _db

  // Initialize all fulcrum directories (data dir, worktrees, etc.)
  initializeFulcrumDirectories()

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
// This allows tests to set FULCRUM_DIR before the database is initialized
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
function runMigrations(_sqlite: Database, drizzleDb: BunSQLiteDatabase<typeof schema>): void {
  let migrationsPath: string

  if (process.env.FULCRUM_PACKAGE_ROOT) {
    migrationsPath = join(process.env.FULCRUM_PACKAGE_ROOT, 'drizzle')
  } else {
    const serverDir = dirname(import.meta.dir)
    const projectRoot = dirname(serverDir)
    migrationsPath = join(projectRoot, 'drizzle')
  }

  if (!existsSync(migrationsPath)) {
    log.db.warn('Migrations folder not found', { migrationsPath })
    return
  }

  migrate(drizzleDb, { migrationsFolder: migrationsPath })
}

// Re-export schema for convenience
export * from './schema'
