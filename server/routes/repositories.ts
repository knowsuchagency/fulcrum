import { Hono } from 'hono'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { db, repositories, type NewRepository } from '../db'
import { eq, desc, sql } from 'drizzle-orm'
import { getSettings } from '../lib/settings'
import { isGitUrl, extractRepoNameFromUrl } from '../lib/git-utils'

const app = new Hono()

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
  return c.json(allRepos)
})

// GET /api/repositories/:id - Get single repository
app.get('/:id', (c) => {
  const id = c.req.param('id')
  const repo = db.select().from(repositories).where(eq(repositories.id, id)).get()
  if (!repo) {
    return c.json({ error: 'Repository not found' }, 404)
  }
  return c.json(repo)
})

// POST /api/repositories - Create repository
app.post('/', async (c) => {
  try {
    const body = await c.req.json<{
      path: string
      displayName: string
      startupScript?: string | null
      copyFiles?: string | null
      isCopierTemplate?: boolean
    }>()

    if (!body.path) {
      return c.json({ error: 'path is required' }, 400)
    }

    // Check for duplicate path
    const existing = db
      .select()
      .from(repositories)
      .where(eq(repositories.path, body.path))
      .get()
    if (existing) {
      return c.json({ error: 'Repository with this path already exists' }, 400)
    }

    const now = new Date().toISOString()
    const displayName = body.displayName || body.path.split('/').pop() || 'repo'

    const newRepo: NewRepository = {
      id: crypto.randomUUID(),
      path: body.path,
      displayName,
      startupScript: body.startupScript || null,
      copyFiles: body.copyFiles || null,
      isCopierTemplate: body.isCopierTemplate ?? false,
      createdAt: now,
      updatedAt: now,
    }

    db.insert(repositories).values(newRepo).run()
    const created = db.select().from(repositories).where(eq(repositories.id, newRepo.id)).get()
    return c.json(created, 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to create repository' }, 400)
  }
})

// POST /api/repositories/clone - Clone repository from URL
app.post('/clone', async (c) => {
  try {
    const body = await c.req.json<{
      url: string
      displayName?: string
    }>()

    if (!body.url) {
      return c.json({ error: 'url is required' }, 400)
    }

    if (!isGitUrl(body.url)) {
      return c.json({ error: 'Invalid git URL format' }, 400)
    }

    // Get the default git repos directory
    const settings = getSettings()
    const gitReposDir = settings.paths.defaultGitReposDir

    // Derive the repo name from URL
    const repoName = extractRepoNameFromUrl(body.url)
    const targetPath = join(gitReposDir, repoName)

    // Check if directory already exists
    if (existsSync(targetPath)) {
      return c.json({ error: `Directory already exists: ${targetPath}` }, 400)
    }

    // Clone the repository
    try {
      execSync(`git clone "${body.url}" "${targetPath}"`, {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 120000, // 2 minute timeout
      })
    } catch (cloneErr) {
      // Clean up partial clone if it exists
      if (existsSync(targetPath)) {
        rmSync(targetPath, { recursive: true, force: true })
      }

      const errorMessage = cloneErr instanceof Error ? cloneErr.message : 'Clone failed'
      // Try to provide a more helpful error message
      if (errorMessage.includes('Permission denied') || errorMessage.includes('publickey')) {
        return c.json({ error: 'Authentication failed. Check your SSH keys or use HTTPS with credentials.' }, 500)
      }
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        return c.json({ error: 'Repository not found or access denied' }, 500)
      }
      return c.json({ error: `Failed to clone repository: ${errorMessage}` }, 500)
    }

    // Check for duplicate path in database
    const existing = db
      .select()
      .from(repositories)
      .where(eq(repositories.path, targetPath))
      .get()
    if (existing) {
      return c.json({ error: 'Repository with this path already exists in database' }, 400)
    }

    const now = new Date().toISOString()
    const displayName = body.displayName || repoName

    const newRepo: NewRepository = {
      id: crypto.randomUUID(),
      path: targetPath,
      displayName,
      remoteUrl: body.url,
      startupScript: null,
      copyFiles: null,
      isCopierTemplate: false,
      createdAt: now,
      updatedAt: now,
    }

    db.insert(repositories).values(newRepo).run()
    const created = db.select().from(repositories).where(eq(repositories.id, newRepo.id)).get()
    return c.json(created, 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to clone repository' }, 500)
  }
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
      isCopierTemplate?: boolean
    }>()

    // If path is changing, check for duplicates
    if (body.path && body.path !== existing.path) {
      const duplicate = db
        .select()
        .from(repositories)
        .where(eq(repositories.path, body.path))
        .get()
      if (duplicate) {
        return c.json({ error: 'Repository with this path already exists' }, 400)
      }
    }

    const now = new Date().toISOString()
    db.update(repositories)
      .set({ ...body, updatedAt: now })
      .where(eq(repositories.id, id))
      .run()

    const updated = db.select().from(repositories).where(eq(repositories.id, id)).get()
    return c.json(updated)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to update repository' }, 400)
  }
})

// DELETE /api/repositories/:id - Delete repository
app.delete('/:id', (c) => {
  const id = c.req.param('id')
  const existing = db.select().from(repositories).where(eq(repositories.id, id)).get()
  if (!existing) {
    return c.json({ error: 'Repository not found' }, 404)
  }

  db.delete(repositories).where(eq(repositories.id, id)).run()
  return c.json({ success: true })
})

export default app
