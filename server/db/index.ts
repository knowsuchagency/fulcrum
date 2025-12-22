import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { readdirSync } from 'node:fs'
import * as schema from './schema'
import { initializeViboraDirectories, getSetting } from '../lib/settings'

// Initialize all vibora directories (data dir, worktrees, etc.)
initializeViboraDirectories()

const dbPath = getSetting('databasePath')
const sqlite = new Database(dbPath)

// Enable WAL mode for better performance
sqlite.exec('PRAGMA journal_mode = WAL')

export const db = drizzle(sqlite, { schema })

// In bundled mode (CLI), run migrations programmatically.
// In dev mode, migrations are handled by drizzle-kit push.
if (process.env.VIBORA_PACKAGE_ROOT) {
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

  migrate(db, { migrationsFolder: migrationsPath })
}

// Re-export schema for convenience
export * from './schema'
