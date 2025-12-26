import { Hono } from 'hono'
import { db, repositories, type NewRepository } from '../db'
import { eq, desc, sql } from 'drizzle-orm'

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
