import { Hono } from 'hono'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { db, repositories, projects } from '../db'
import { eq, desc, sql } from 'drizzle-orm'
import { getSettings, expandPath } from '../lib/settings'
import type { Repository } from '../../../shared/types'

const app = new Hono()

// Transform database row to API response (parse JSON fields)
function toApiResponse(row: typeof repositories.$inferSelect): Repository {
  return {
    ...row,
    claudeOptions: row.claudeOptions ? JSON.parse(row.claudeOptions) : null,
    opencodeOptions: row.opencodeOptions ? JSON.parse(row.opencodeOptions) : null,
  }
}

// GET /api/repositories - List all repositories (sorted by last used, then created)
app.get('/', (c) => {
  const allRepos = db
    .select()
    .from(repositories)
    .orderBy(
      // Sort by lastUsedAt DESC (nulls last), then by createdAt DESC
      desc(sql`COALESCE(${repositories.lastUsedAt}, '1970-01-01')`),
      desc(repositories.createdAt)
    )
    .all()
  return c.json(allRepos.map(toApiResponse))
})

// GET /api/repositories/:id - Get single repository
app.get('/:id', (c) => {
  const id = c.req.param('id')
  const repo = db.select().from(repositories).where(eq(repositories.id, id)).get()
  if (!repo) {
    return c.json({ error: 'Repository not found' }, 404)
  }
  return c.json(toApiResponse(repo))
})

// POST /api/repositories - DEPRECATED: Use POST /api/projects instead
// Repositories must be created through projects to maintain data integrity
app.post('/', (c) => {
  return c.json({
    error: 'Standalone repository creation is not supported. Use POST /api/projects to create a project with a repository.',
  }, 400)
})

// POST /api/repositories/clone - DEPRECATED: Use POST /api/projects instead
// Repositories must be created through projects to maintain data integrity
app.post('/clone', (c) => {
  return c.json({
    error: 'Standalone repository cloning is not supported. Use POST /api/projects to create a project with a cloned repository.',
  }, 400)
})

// PATCH /api/repositories/:id - Update repository
app.patch('/:id', async (c) => {
  const id = c.req.param('id')

  try {
    const existing = db.select().from(repositories).where(eq(repositories.id, id)).get()
    if (!existing) {
      return c.json({ error: 'Repository not found' }, 404)
    }

    const body = await c.req.json<{
      path?: string
      displayName?: string
      startupScript?: string | null
      copyFiles?: string | null
      claudeOptions?: Record<string, string> | null
      opencodeOptions?: Record<string, string> | null
      opencodeModel?: string | null
      defaultAgent?: 'claude' | 'opencode' | null
      isCopierTemplate?: boolean
    }>()

    // If path is changing, validate and check for duplicates
    if (body.path && body.path !== existing.path) {
      const newPath = expandPath(body.path)

      // Check if directory exists
      if (!existsSync(newPath)) {
        return c.json({ error: `Directory does not exist: ${newPath}` }, 400)
      }

      const duplicate = db
        .select()
        .from(repositories)
        .where(eq(repositories.path, newPath))
        .get()
      if (duplicate) {
        return c.json({ error: 'Repository with this path already exists' }, 400)
      }

      // Update body.path with expanded path
      body.path = newPath
    }

    const now = new Date().toISOString()

    // Serialize agent options if provided
    const updateData: Record<string, unknown> = { ...body, updatedAt: now }
    if ('claudeOptions' in body) {
      updateData.claudeOptions = body.claudeOptions ? JSON.stringify(body.claudeOptions) : null
    }
    if ('opencodeOptions' in body) {
      updateData.opencodeOptions = body.opencodeOptions ? JSON.stringify(body.opencodeOptions) : null
    }

    db.update(repositories)
      .set(updateData)
      .where(eq(repositories.id, id))
      .run()

    const updated = db.select().from(repositories).where(eq(repositories.id, id)).get()
    return c.json(updated ? toApiResponse(updated) : null)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to update repository' }, 400)
  }
})

// DELETE /api/repositories/:id - Delete repository
// Rejects if a project references this repository (use DELETE /api/projects/:id instead)
app.delete('/:id', (c) => {
  const id = c.req.param('id')

  const existing = db.select().from(repositories).where(eq(repositories.id, id)).get()
  if (!existing) {
    return c.json({ error: 'Repository not found' }, 404)
  }

  // Check if any project references this repository
  const linkedProject = db.select().from(projects).where(eq(projects.repositoryId, id)).get()
  if (linkedProject) {
    return c.json({
      error: 'Cannot delete repository that is linked to a project. Use DELETE /api/projects/:id instead.',
      projectId: linkedProject.id,
    }, 400)
  }

  // If no project references this repository, allow deletion (cleanup orphaned repos)
  db.delete(repositories).where(eq(repositories.id, id)).run()
  return c.json({ success: true })
})

// POST /api/repositories/scan - Scan directory for git repositories
app.post('/scan', async (c) => {
  try {
    const body = await c.req.json<{ directory?: string }>().catch(() => ({}))

    // Default to configured git repos directory, expand tilde if present
    const settings = getSettings()
    const directory = expandPath(body.directory || settings.paths.defaultGitReposDir)

    if (!existsSync(directory)) {
      return c.json({ error: `Directory does not exist: ${directory}` }, 400)
    }

    // Get existing repository paths for comparison
    const existingRepos = db.select({ path: repositories.path }).from(repositories).all()
    const existingPaths = new Set(existingRepos.map((r) => r.path))

    // Scan immediate subdirectories for .git folders
    const discovered: Array<{ path: string; name: string; exists: boolean }> = []

    const entries = readdirSync(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      // Skip hidden directories
      if (entry.name.startsWith('.')) continue

      const subPath = join(directory, entry.name)
      const gitPath = join(subPath, '.git')

      if (existsSync(gitPath)) {
        discovered.push({
          path: subPath,
          name: entry.name,
          exists: existingPaths.has(subPath),
        })
      }
    }

    // Sort by name
    discovered.sort((a, b) => a.name.localeCompare(b.name))

    return c.json({ directory, repositories: discovered })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to scan directory' }, 500)
  }
})

// POST /api/repositories/bulk - DEPRECATED: Use POST /api/projects/bulk instead
// Repositories must be created through projects to maintain data integrity
app.post('/bulk', (c) => {
  return c.json({
    error: 'Standalone bulk repository creation is not supported. Use POST /api/projects/bulk to create projects with repositories.',
  }, 400)
})

export default app
