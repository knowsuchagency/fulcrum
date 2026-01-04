import { db, resetDatabase } from '../../db'
import {
  tasks,
  terminals,
  terminalTabs,
  terminalViewState,
  repositories,
  systemMetrics,
} from '../../db/schema'

/**
 * Clears all data from all tables.
 * Call this in afterEach() to ensure test isolation.
 */
export async function clearDatabase(): Promise<void> {
  // Delete in order to avoid foreign key issues (though SQLite doesn't enforce them by default)
  await db.delete(systemMetrics)
  await db.delete(terminals)
  await db.delete(terminalTabs)
  await db.delete(terminalViewState)
  await db.delete(tasks)
  await db.delete(repositories)
}

/**
 * Initializes the database schema.
 * The database is lazily initialized when first accessed via the db proxy.
 * Migrations run automatically on initialization.
 * Since we're using VIBORA_DIR isolation, the database will be fresh.
 */
export async function initSchema(): Promise<void> {
  // Access db to trigger lazy initialization which creates the vibora directory
  // and database file. Migrations are run automatically on initialization.
}

/**
 * Helper to insert a test task.
 */
export async function insertTestTask(data: {
  id?: string
  title: string
  repoPath: string
  repoName?: string
  baseBranch?: string
  status?: string
  position?: number
  worktreePath?: string
}): Promise<typeof tasks.$inferSelect> {
  const now = new Date().toISOString()
  const id = data.id ?? crypto.randomUUID()

  const [task] = await db
    .insert(tasks)
    .values({
      id,
      title: data.title,
      status: data.status ?? 'IN_PROGRESS',
      position: data.position ?? 0,
      repoPath: data.repoPath,
      repoName: data.repoName ?? 'test-repo',
      baseBranch: data.baseBranch ?? 'main',
      worktreePath: data.worktreePath,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  return task
}

/**
 * Helper to insert a test repository.
 */
export async function insertTestRepository(data: {
  id?: string
  path: string
  displayName?: string
}): Promise<typeof repositories.$inferSelect> {
  const now = new Date().toISOString()
  const id = data.id ?? crypto.randomUUID()

  const [repo] = await db
    .insert(repositories)
    .values({
      id,
      path: data.path,
      displayName: data.displayName ?? 'Test Repo',
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  return repo
}

// Re-export for convenience
export { db, resetDatabase }
