import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { db, labels, taskLabels, projectLabels } from '../db'
import { eq, sql, like, and } from 'drizzle-orm'
import type { Label, LabelWithUsage } from '../../shared/types'

const app = new Hono()

// Helper to get label with usage counts
function getLabelWithUsage(label: typeof labels.$inferSelect): LabelWithUsage {
  const taskCount = db
    .select({ count: sql<number>`count(*)` })
    .from(taskLabels)
    .where(eq(taskLabels.labelId, label.id))
    .get()

  const projectCount = db
    .select({ count: sql<number>`count(*)` })
    .from(projectLabels)
    .where(eq(projectLabels.labelId, label.id))
    .get()

  return {
    id: label.id,
    name: label.name,
    color: label.color,
    createdAt: label.createdAt,
    taskCount: taskCount?.count ?? 0,
    projectCount: projectCount?.count ?? 0,
  }
}

// GET /api/labels - List all labels with usage counts
app.get('/', (c) => {
  const allLabels = db.select().from(labels).orderBy(labels.name).all()
  const result: LabelWithUsage[] = allLabels.map(getLabelWithUsage)
  return c.json(result)
})

// GET /api/labels/search - Search labels with optional prefix matching
app.get('/search', (c) => {
  const query = c.req.query('q')?.trim() || ''
  const limit = parseInt(c.req.query('limit') || '10', 10)

  let matchingLabels: (typeof labels.$inferSelect)[]

  if (query) {
    // Prefix/substring match
    matchingLabels = db
      .select()
      .from(labels)
      .where(like(labels.name, `%${query}%`))
      .orderBy(labels.name)
      .limit(limit)
      .all()
  } else {
    // Return most-used labels when no query
    matchingLabels = db.select().from(labels).orderBy(labels.name).limit(limit).all()
  }

  const result: LabelWithUsage[] = matchingLabels.map(getLabelWithUsage)

  // Sort by total usage (most used first)
  result.sort((a, b) => (b.taskCount + b.projectCount) - (a.taskCount + a.projectCount))

  return c.json(result)
})

// GET /api/labels/:id - Get a single label
app.get('/:id', (c) => {
  const id = c.req.param('id')
  const label = db.select().from(labels).where(eq(labels.id, id)).get()

  if (!label) {
    return c.json({ error: 'Label not found' }, 404)
  }

  return c.json(getLabelWithUsage(label))
})

// POST /api/labels - Create a new label
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
    const existing = db.select().from(labels).where(eq(labels.name, name)).get()
    if (existing) {
      return c.json({ error: 'Label with this name already exists' }, 400)
    }

    const now = new Date().toISOString()
    const id = nanoid()

    db.insert(labels)
      .values({
        id,
        name,
        color: body.color?.trim() || null,
        createdAt: now,
      })
      .run()

    const label = db.select().from(labels).where(eq(labels.id, id)).get()!
    return c.json(getLabelWithUsage(label), 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to create label' }, 400)
  }
})

// POST /api/labels/find-or-create - Find existing label or create new one
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

    // Check for existing label
    const existing = db.select().from(labels).where(eq(labels.name, name)).get()
    if (existing) {
      return c.json(getLabelWithUsage(existing))
    }

    // Create new label
    const now = new Date().toISOString()
    const id = nanoid()

    db.insert(labels)
      .values({
        id,
        name,
        color: body.color?.trim() || null,
        createdAt: now,
      })
      .run()

    const label = db.select().from(labels).where(eq(labels.id, id)).get()!
    return c.json(getLabelWithUsage(label), 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to create label' }, 400)
  }
})

// PATCH /api/labels/:id - Update a label
app.patch('/:id', async (c) => {
  const id = c.req.param('id')

  try {
    const existing = db.select().from(labels).where(eq(labels.id, id)).get()
    if (!existing) {
      return c.json({ error: 'Label not found' }, 404)
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
        .from(labels)
        .where(and(eq(labels.name, name), sql`${labels.id} != ${id}`))
        .get()

      if (duplicate) {
        return c.json({ error: 'Label with this name already exists' }, 400)
      }

      updateData.name = name
    }

    if (body.color !== undefined) {
      updateData.color = body.color?.trim() || null
    }

    if (Object.keys(updateData).length > 0) {
      db.update(labels).set(updateData).where(eq(labels.id, id)).run()
    }

    const label = db.select().from(labels).where(eq(labels.id, id)).get()!
    return c.json(getLabelWithUsage(label))
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to update label' }, 400)
  }
})

// DELETE /api/labels/:id - Delete a label
app.delete('/:id', (c) => {
  const id = c.req.param('id')

  const existing = db.select().from(labels).where(eq(labels.id, id)).get()
  if (!existing) {
    return c.json({ error: 'Label not found' }, 404)
  }

  // Delete all task_labels and project_labels associations first
  db.delete(taskLabels).where(eq(taskLabels.labelId, id)).run()
  db.delete(projectLabels).where(eq(projectLabels.labelId, id)).run()

  // Delete the label
  db.delete(labels).where(eq(labels.id, id)).run()

  return c.json({ success: true })
})

export default app
