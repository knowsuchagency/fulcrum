import { Hono } from 'hono'
import { eq, or } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db, tasks, taskDependencies } from '../db'

const app = new Hono()

// GET /api/task-dependencies/graph - Get all dependencies for graph visualization
app.get('/graph', (c) => {
  const allDeps = db.select().from(taskDependencies).all()
  const allTasks = db.select().from(tasks).all()

  return c.json({
    nodes: allTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      projectId: t.projectId,
      labels: t.labels ? JSON.parse(t.labels) : [],
      dueDate: t.dueDate,
    })),
    edges: allDeps.map((d) => ({
      id: d.id,
      source: d.dependsOnTaskId,
      target: d.taskId,
    })),
  })
})

// GET /api/task-dependencies/:taskId - Get dependencies for a specific task
app.get('/:taskId', (c) => {
  const taskId = c.req.param('taskId')

  // Get all dependencies where this task is either the dependent or the dependency
  const deps = db
    .select()
    .from(taskDependencies)
    .where(
      or(eq(taskDependencies.taskId, taskId), eq(taskDependencies.dependsOnTaskId, taskId))
    )
    .all()

  // Get task info for all related tasks
  const relatedTaskIds = new Set<string>()
  const blockedByIds: string[] = []
  const blockingIds: string[] = []

  for (const dep of deps) {
    if (dep.taskId === taskId) {
      // This task depends on another task (blocked by)
      blockedByIds.push(dep.dependsOnTaskId)
      relatedTaskIds.add(dep.dependsOnTaskId)
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
        const dep = deps.find((d) => d.taskId === taskId && d.dependsOnTaskId === id)
        return task && dep ? { ...task, dependencyId: dep.id } : null
      })
      .filter(Boolean),
    blocking: blockingIds
      .map((id) => {
        const task = taskMap.get(id)
        const dep = deps.find((d) => d.taskId === id && d.dependsOnTaskId === taskId)
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
    .from(taskDependencies)
    .where(eq(taskDependencies.taskId, taskId))
    .all()
    .find((d) => d.dependsOnTaskId === body.dependsOnTaskId)

  if (existing) {
    return c.json({ error: 'Dependency already exists' }, 400)
  }

  // Check for circular dependency (dependsOnTask should not depend on taskId)
  const reverseDep = db
    .select()
    .from(taskDependencies)
    .where(eq(taskDependencies.taskId, body.dependsOnTaskId))
    .all()
    .find((d) => d.dependsOnTaskId === taskId)

  if (reverseDep) {
    return c.json({ error: 'Circular dependency detected' }, 400)
  }

  // Create the dependency
  const id = nanoid()
  const now = new Date().toISOString()

  db.insert(taskDependencies)
    .values({
      id,
      taskId,
      dependsOnTaskId: body.dependsOnTaskId,
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
    .from(taskDependencies)
    .where(eq(taskDependencies.id, dependencyId))
    .get()

  if (!dep) {
    return c.json({ error: 'Dependency not found' }, 404)
  }

  // Verify the dependency is related to the task
  if (dep.taskId !== taskId && dep.dependsOnTaskId !== taskId) {
    return c.json({ error: 'Dependency not related to this task' }, 400)
  }

  db.delete(taskDependencies).where(eq(taskDependencies.id, dependencyId)).run()

  return c.json({ success: true })
})

export default app
