import { Hono } from 'hono'
import { existsSync, rmSync, readdirSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { db, repositories, type NewRepository } from '../db'
import { eq, desc, sql, inArray } from 'drizzle-orm'
import { getSettings, expandPath } from '../lib/settings'
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
      targetDir?: string // Parent directory for clone (defaults to defaultGitReposDir)
      folderName?: string // Custom folder name (defaults to extracted from URL)
    }>()

    if (!body.url) {
      return c.json({ error: 'url is required' }, 400)
    }

    if (!isGitUrl(body.url)) {
      return c.json({ error: 'Invalid git URL format' }, 400)
    }

    // Get settings for default directory
    const settings = getSettings()

    // Determine parent directory (expand tilde if present)
    let parentDir = body.targetDir?.trim() || settings.paths.defaultGitReposDir
    parentDir = expandPath(parentDir)

    // SAFETY: Reject if parent directory is exactly the home directory
    const home = homedir()
    if (resolve(parentDir) === home) {
      return c.json({ error: 'Cannot clone directly into home directory. Please specify a subdirectory.' }, 400)
    }

    // Derive folder name (use provided or extract from URL)
    const repoName = body.folderName?.trim() || extractRepoNameFromUrl(body.url)

    // SAFETY: Validate folder name
    if (!repoName) {
      return c.json({ error: 'Could not determine folder name from URL' }, 400)
    }
    if (repoName === '.' || repoName === '..') {
      return c.json({ error: 'Invalid folder name' }, 400)
    }
    if (repoName.includes('/') || repoName.includes('\\')) {
      return c.json({ error: 'Folder name cannot contain path separators' }, 400)
    }

    const targetPath = join(parentDir, repoName)

    // SAFETY: Path traversal protection - ensure target is within parent
    const resolvedParent = resolve(parentDir)
    const resolvedTarget = resolve(targetPath)
    if (!resolvedTarget.startsWith(resolvedParent + '/') && resolvedTarget !== resolvedParent) {
      return c.json({ error: 'Invalid target path' }, 400)
    }

    // Check if directory already exists
    if (existsSync(targetPath)) {
      return c.json({ error: `Directory already exists: ${targetPath}` }, 400)
    }

    // Create parent directory if needed (but NEVER create home directory)
    if (!existsSync(parentDir)) {
      if (resolve(parentDir) === home) {
        return c.json({ error: 'Cannot create home directory' }, 400)
      }
      mkdirSync(parentDir, { recursive: true })
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
      // SAFETY: Only remove if path is within the intended parent directory
      if (existsSync(targetPath) && resolvedTarget.startsWith(resolvedParent + '/')) {
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

// POST /api/repositories/scan - Scan directory for git repositories
app.post('/scan', async (c) => {
  try {
    const body = await c.req.json<{ directory?: string }>().catch(() => ({}))

    // Default to configured git repos directory
    const settings = getSettings()
    const directory = body.directory || settings.paths.defaultGitReposDir

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

// POST /api/repositories/bulk - Bulk create repositories
app.post('/bulk', async (c) => {
  try {
    const body = await c.req.json<{
      repositories: Array<{ path: string; displayName?: string }>
    }>()

    if (!body.repositories || !Array.isArray(body.repositories) || body.repositories.length === 0) {
      return c.json({ error: 'repositories array is required' }, 400)
    }

    // Get paths that already exist
    const paths = body.repositories.map((r) => r.path)
    const existingRepos = db
      .select({ path: repositories.path })
      .from(repositories)
      .where(inArray(repositories.path, paths))
      .all()
    const existingPaths = new Set(existingRepos.map((r) => r.path))

    const now = new Date().toISOString()
    const toCreate: NewRepository[] = []

    for (const repo of body.repositories) {
      // Skip if path already exists
      if (existingPaths.has(repo.path)) continue

      // Verify the path exists on disk
      if (!existsSync(repo.path)) continue

      const displayName = repo.displayName || repo.path.split('/').pop() || 'repo'
      toCreate.push({
        id: crypto.randomUUID(),
        path: repo.path,
        displayName,
        startupScript: null,
        copyFiles: null,
        isCopierTemplate: false,
        createdAt: now,
        updatedAt: now,
      })
    }

    if (toCreate.length > 0) {
      db.insert(repositories).values(toCreate).run()
    }

    // Fetch created repositories
    const createdIds = toCreate.map((r) => r.id)
    const created =
      createdIds.length > 0
        ? db.select().from(repositories).where(inArray(repositories.id, createdIds)).all()
        : []

    return c.json({
      created,
      skipped: body.repositories.length - toCreate.length,
    })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to bulk create repositories' }, 500)
  }
})

export default app
