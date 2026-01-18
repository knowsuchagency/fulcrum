import { Hono } from 'hono'
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

export default app
