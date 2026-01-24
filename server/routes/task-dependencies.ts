import { Hono } from 'hono'
import { eq, or, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db, tasks, taskRelationships } from '../db'

const app = new Hono()

// GET /api/task-dependencies/graph - Get all dependencies for graph visualization
app.get('/graph', (c) => {
  // Only include 'depends_on' relationships for dependency graph
  const allDeps = db
    .select()
    .from(taskRelationships)
    .where(eq(taskRelationships.type, 'depends_on'))
    .all()
  const allTasks = db.select().from(tasks).all()

  // Build maps for filtering
  const taskMap = new Map(allTasks.map((t) => [t.id, t]))
  const completedStatuses = new Set(['DONE', 'CANCELED'])

  // Filter edges to only include those where:
  // 1. Both tasks exist
  // 2. At least one task is not in a completed state
  const validEdges = allDeps.filter((d) => {
    const sourceTask = taskMap.get(d.relatedTaskId)
    const targetTask = taskMap.get(d.taskId)
    if (!sourceTask || !targetTask) return false
    // Skip if both tasks are completed
    const bothCompleted =
      completedStatuses.has(sourceTask.status) && completedStatuses.has(targetTask.status)
    return !bothCompleted
  })

  return c.json({
    nodes: allTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      projectId: t.projectId,
      tags: t.tags ? JSON.parse(t.tags) : [],
      dueDate: t.dueDate,
    })),
    edges: validEdges.map((d) => ({
      id: d.id,
      source: d.relatedTaskId,
      target: d.taskId,
    })),
  })
})

// GET /api/task-dependencies/:taskId - Get dependencies for a specific task
app.get('/:taskId', (c) => {
  const taskId = c.req.param('taskId')

  // Get all 'depends_on' relationships where this task is either the dependent or the dependency
  const deps = db
    .select()
    .from(taskRelationships)
    .where(
      and(
        eq(taskRelationships.type, 'depends_on'),
        or(eq(taskRelationships.taskId, taskId), eq(taskRelationships.relatedTaskId, taskId))
      )
    )
    .all()

  // Get task info for all related tasks
  const relatedTaskIds = new Set<string>()
  const blockedByIds: string[] = []
  const blockingIds: string[] = []

  for (const dep of deps) {
    if (dep.taskId === taskId) {
      // This task depends on another task (blocked by)
      blockedByIds.push(dep.relatedTaskId)
      relatedTaskIds.add(dep.relatedTaskId)
    } else {
      // Another task depends on this task (blocking)
      blockingIds.push(dep.taskId)
      relatedTaskIds.add(dep.taskId)
    }
  }

  // Fetch task details for related tasks
  const relatedTasks = relatedTaskIds.size > 0
    ? db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
        })
        .from(tasks)
        .all()
        .filter((t) => relatedTaskIds.has(t.id))
    : []

  const taskMap = new Map(relatedTasks.map((t) => [t.id, t]))

  return c.json({
    blockedBy: blockedByIds
      .map((id) => {
        const task = taskMap.get(id)
        const dep = deps.find((d) => d.taskId === taskId && d.relatedTaskId === id)
        return task && dep ? { ...task, dependencyId: dep.id } : null
      })
      .filter(Boolean),
    blocking: blockingIds
      .map((id) => {
        const task = taskMap.get(id)
        const dep = deps.find((d) => d.taskId === id && d.relatedTaskId === taskId)
        return task && dep ? { ...task, dependencyId: dep.id } : null
      })
      .filter(Boolean),
  })
})

// POST /api/task-dependencies/:taskId - Add a dependency
app.post('/:taskId', async (c) => {
  const taskId = c.req.param('taskId')
  const body = await c.req.json<{ dependsOnTaskId: string }>()

  // Validate that both tasks exist
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  const dependsOnTask = db.select().from(tasks).where(eq(tasks.id, body.dependsOnTaskId)).get()

  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }
  if (!dependsOnTask) {
    return c.json({ error: 'Dependency task not found' }, 404)
  }
  if (taskId === body.dependsOnTaskId) {
    return c.json({ error: 'A task cannot depend on itself' }, 400)
  }

  // Check for existing dependency
  const existing = db
    .select()
    .from(taskRelationships)
    .where(
      and(
        eq(taskRelationships.taskId, taskId),
        eq(taskRelationships.relatedTaskId, body.dependsOnTaskId),
        eq(taskRelationships.type, 'depends_on')
      )
    )
    .get()

  if (existing) {
    return c.json({ error: 'Dependency already exists' }, 400)
  }

  // Check for circular dependency (dependsOnTask should not depend on taskId)
  const reverseDep = db
    .select()
    .from(taskRelationships)
    .where(
      and(
        eq(taskRelationships.taskId, body.dependsOnTaskId),
        eq(taskRelationships.relatedTaskId, taskId),
        eq(taskRelationships.type, 'depends_on')
      )
    )
    .get()

  if (reverseDep) {
    return c.json({ error: 'Circular dependency detected' }, 400)
  }

  // Create the dependency
  const id = nanoid()
  const now = new Date().toISOString()

  db.insert(taskRelationships)
    .values({
      id,
      taskId,
      relatedTaskId: body.dependsOnTaskId,
      type: 'depends_on',
      createdAt: now,
    })
    .run()

  return c.json({
    id,
    taskId,
    dependsOnTaskId: body.dependsOnTaskId,
    createdAt: now,
  })
})

// DELETE /api/task-dependencies/:taskId/:dependencyId - Remove a dependency
app.delete('/:taskId/:dependencyId', (c) => {
  const taskId = c.req.param('taskId')
  const dependencyId = c.req.param('dependencyId')

  const dep = db
    .select()
    .from(taskRelationships)
    .where(eq(taskRelationships.id, dependencyId))
    .get()

  if (!dep) {
    return c.json({ error: 'Dependency not found' }, 404)
  }

  // Verify the dependency is related to the task
  if (dep.taskId !== taskId && dep.relatedTaskId !== taskId) {
    return c.json({ error: 'Dependency not related to this task' }, 400)
  }

  db.delete(taskRelationships).where(eq(taskRelationships.id, dependencyId)).run()

  return c.json({ success: true })
})

export default app
