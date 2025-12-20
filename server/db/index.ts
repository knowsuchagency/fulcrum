import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Database } from 'bun:sqlite'
import * as schema from './schema'
import * as path from 'path'
import { initializeViboraDirectories, getViboraDir } from '../lib/settings'

// Initialize all vibora directories (data dir, worktrees, etc.)
initializeViboraDirectories()

const dbPath = path.join(getViboraDir(), 'vibora.db')
const sqlite = new Database(dbPath)

// Enable WAL mode for better performance
sqlite.exec('PRAGMA journal_mode = WAL')

export const db = drizzle(sqlite, { schema })

// Re-export schema for convenience
export * from './schema'
