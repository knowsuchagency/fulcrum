import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { db, tags, taskTags, projectTags } from '../db'
import { eq, sql, like, and } from 'drizzle-orm'
import type { TagWithUsage } from '../../shared/types'

const app = new Hono()

// Helper to get tag with usage counts
function getTagWithUsage(tag: typeof tags.$inferSelect): TagWithUsage {
  const taskCount = db
    .select({ count: sql<number>`count(*)` })
    .from(taskTags)
    .where(eq(taskTags.tagId, tag.id))
    .get()

  const projectCount = db
    .select({ count: sql<number>`count(*)` })
    .from(projectTags)
    .where(eq(projectTags.tagId, tag.id))
    .get()

  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt,
    taskCount: taskCount?.count ?? 0,
    projectCount: projectCount?.count ?? 0,
  }
}

// GET /api/tags - List all tags with usage counts
app.get('/', (c) => {
  const allTags = db.select().from(tags).orderBy(tags.name).all()
  const result: TagWithUsage[] = allTags.map(getTagWithUsage)
  return c.json(result)
})

// GET /api/tags/search - Search tags with optional prefix matching
app.get('/search', (c) => {
  const query = c.req.query('q')?.trim() || ''
  const limit = parseInt(c.req.query('limit') || '10', 10)

  let matchingTags: (typeof tags.$inferSelect)[]

  if (query) {
    // Prefix/substring match
    matchingTags = db
      .select()
      .from(tags)
      .where(like(tags.name, `%${query}%`))
      .orderBy(tags.name)
      .limit(limit)
      .all()
  } else {
    // Return most-used tags when no query
    matchingTags = db.select().from(tags).orderBy(tags.name).limit(limit).all()
  }

  const result: TagWithUsage[] = matchingTags.map(getTagWithUsage)

  // Sort by total usage (most used first)
  result.sort((a, b) => (b.taskCount + b.projectCount) - (a.taskCount + a.projectCount))

  return c.json(result)
})

// GET /api/tags/:id - Get a single tag
app.get('/:id', (c) => {
  const id = c.req.param('id')
  const tag = db.select().from(tags).where(eq(tags.id, id)).get()

  if (!tag) {
    return c.json({ error: 'Tag not found' }, 404)
  }

  return c.json(getTagWithUsage(tag))
})

// POST /api/tags - Create a new tag
app.post('/', async (c) => {
  try {
    const body = await c.req.json<{
      name: string
      color?: string
    }>()

    if (!body.name?.trim()) {
      return c.json({ error: 'name is required' }, 400)
    }

    const name = body.name.trim()

    // Check for duplicate name
    const existing = db.select().from(tags).where(eq(tags.name, name)).get()
    if (existing) {
      return c.json({ error: 'Tag with this name already exists' }, 400)
    }

    const now = new Date().toISOString()
    const id = nanoid()

    db.insert(tags)
      .values({
        id,
        name,
        color: body.color?.trim() || null,
        createdAt: now,
      })
      .run()

    const tag = db.select().from(tags).where(eq(tags.id, id)).get()!
    return c.json(getTagWithUsage(tag), 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to create tag' }, 400)
  }
})

// POST /api/tags/find-or-create - Find existing tag or create new one
app.post('/find-or-create', async (c) => {
  try {
    const body = await c.req.json<{
      name: string
      color?: string
    }>()

    if (!body.name?.trim()) {
      return c.json({ error: 'name is required' }, 400)
    }

    const name = body.name.trim()

    // Check for existing tag
    const existing = db.select().from(tags).where(eq(tags.name, name)).get()
    if (existing) {
      return c.json(getTagWithUsage(existing))
    }

    // Create new tag
    const now = new Date().toISOString()
    const id = nanoid()

    db.insert(tags)
      .values({
        id,
        name,
        color: body.color?.trim() || null,
        createdAt: now,
      })
      .run()

    const tag = db.select().from(tags).where(eq(tags.id, id)).get()!
    return c.json(getTagWithUsage(tag), 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to create tag' }, 400)
  }
})

// PATCH /api/tags/:id - Update a tag
app.patch('/:id', async (c) => {
  const id = c.req.param('id')

  try {
    const existing = db.select().from(tags).where(eq(tags.id, id)).get()
    if (!existing) {
      return c.json({ error: 'Tag not found' }, 404)
    }

    const body = await c.req.json<{
      name?: string
      color?: string | null
    }>()

    const updateData: Record<string, unknown> = {}

    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) {
        return c.json({ error: 'name cannot be empty' }, 400)
      }

      // Check for duplicate name (except self)
      const duplicate = db
        .select()
        .from(tags)
        .where(and(eq(tags.name, name), sql`${tags.id} != ${id}`))
        .get()

      if (duplicate) {
        return c.json({ error: 'Tag with this name already exists' }, 400)
      }

      updateData.name = name
    }

    if (body.color !== undefined) {
      updateData.color = body.color?.trim() || null
    }

    if (Object.keys(updateData).length > 0) {
      db.update(tags).set(updateData).where(eq(tags.id, id)).run()
    }

    const tag = db.select().from(tags).where(eq(tags.id, id)).get()!
    return c.json(getTagWithUsage(tag))
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to update tag' }, 400)
  }
})

// DELETE /api/tags/:id - Delete a tag
app.delete('/:id', (c) => {
  const id = c.req.param('id')

  const existing = db.select().from(tags).where(eq(tags.id, id)).get()
  if (!existing) {
    return c.json({ error: 'Tag not found' }, 404)
  }

  // Delete all task_tags and project_tags associations first
  db.delete(taskTags).where(eq(taskTags.tagId, id)).run()
  db.delete(projectTags).where(eq(projectTags.tagId, id)).run()

  // Delete the tag
  db.delete(tags).where(eq(tags.id, id)).run()

  return c.json({ success: true })
})

export default app
