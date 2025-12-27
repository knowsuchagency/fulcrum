import { Hono } from 'hono'
import { db, tasks, repositories, type Task, type NewTask } from '../db'
import { eq, asc } from 'drizzle-orm'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'
import {
  getPTYManager,
  destroyTerminalAndBroadcast,
  killClaudeInTerminalsForWorktree,
} from '../terminal/pty-instance'
import { broadcast } from '../websocket/terminal-ws'
import { updateTaskStatus } from '../services/task-status'
import { log } from '../lib/logger'

// Helper to create git worktree
function createGitWorktree(
  repoPath: string,
  worktreePath: string,
  branch: string,
  baseBranch: string
): { success: boolean; error?: string } {
  try {
    // Ensure parent directory exists
    const worktreeParent = path.dirname(worktreePath)
    if (!fs.existsSync(worktreeParent)) {
      fs.mkdirSync(worktreeParent, { recursive: true })
    }

    // Create the worktree with a new branch based on baseBranch
    try {
      execSync(`git worktree add -b "${branch}" "${worktreePath}" "${baseBranch}"`, {
        cwd: repoPath,
        encoding: 'utf-8',
      })
    } catch {
      // Branch might already exist, try without -b
      execSync(`git worktree add "${worktreePath}" "${branch}"`, {
        cwd: repoPath,
        encoding: 'utf-8',
      })
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create worktree' }
  }
}

// Helper to delete git worktree
function deleteGitWorktree(repoPath: string, worktreePath: string): void {
  if (!fs.existsSync(worktreePath)) return

  try {
    execSync(`git worktree remove "${worktreePath}" --force`, {
      cwd: repoPath,
      encoding: 'utf-8',
    })
  } catch {
    // If git worktree remove fails, manually remove and prune
    fs.rmSync(worktreePath, { recursive: true, force: true })
    try {
      execSync('git worktree prune', { cwd: repoPath, encoding: 'utf-8' })
    } catch {
      // Ignore prune errors
    }
  }
}

// Helper to destroy terminals associated with a worktree path
function destroyTerminalsForWorktree(worktreePath: string): void {
  try {
    const ptyManager = getPTYManager()
    const terminals = ptyManager.listTerminals()
    for (const terminal of terminals) {
      if (terminal.cwd === worktreePath) {
        destroyTerminalAndBroadcast(terminal.id)
      }
    }
  } catch {
    // PTY manager might not be initialized yet, ignore
  }
}

// Copy files to worktree based on glob patterns
function copyFilesToWorktree(repoPath: string, worktreePath: string, patterns: string): void {
  const patternList = patterns
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)

  for (const pattern of patternList) {
    try {
      const files = glob.sync(pattern, { cwd: repoPath, nodir: true })
      for (const file of files) {
        const srcPath = path.join(repoPath, file)
        const destPath = path.join(worktreePath, file)
        const destDir = path.dirname(destPath)

        // Skip if file already exists (don't overwrite)
        if (fs.existsSync(destPath)) continue

        // Create destination directory if needed
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true })
        }

        fs.copyFileSync(srcPath, destPath)
      }
    } catch (err) {
      log.api.error('Failed to copy files matching pattern', { pattern, error: String(err) })
      // Continue with other patterns
    }
  }
}

const app = new Hono()

// Helper to parse viewState JSON from database
function parseViewState(task: Task): Task & { viewState: unknown } {
  return {
    ...task,
    viewState: task.viewState ? JSON.parse(task.viewState) : null,
  }
}

// GET /api/tasks - List all tasks
app.get('/', (c) => {
  const allTasks = db.select().from(tasks).orderBy(asc(tasks.position)).all()
  return c.json(allTasks.map(parseViewState))
})

// POST /api/tasks - Create task
app.post('/', async (c) => {
  try {
    const body = await c.req.json<
      Omit<NewTask, 'id' | 'createdAt' | 'updatedAt'> & {
        copyFiles?: string
        startupScript?: string
      }
    >()

    // Get max position for the status
    const existingTasks = db
      .select()
      .from(tasks)
      .where(eq(tasks.status, body.status || 'IN_PROGRESS'))
      .all()
    const maxPosition = existingTasks.reduce((max, t) => Math.max(max, t.position), -1)

    const now = new Date().toISOString()
    const newTask: NewTask = {
      id: crypto.randomUUID(),
      title: body.title,
      description: body.description || null,
      status: body.status || 'IN_PROGRESS',
      position: maxPosition + 1,
      repoPath: body.repoPath,
      repoName: body.repoName,
      baseBranch: body.baseBranch,
      branch: body.branch || null,
      worktreePath: body.worktreePath || null,
      startupScript: body.startupScript || null,
      aiMode: body.aiMode || null,
      createdAt: now,
      updatedAt: now,
    }

    // Create git worktree if branch and worktreePath are provided
    if (body.branch && body.worktreePath && body.repoPath && body.baseBranch) {
      const result = createGitWorktree(body.repoPath, body.worktreePath, body.branch, body.baseBranch)
      if (!result.success) {
        return c.json({ error: `Failed to create worktree: ${result.error}` }, 500)
      }

      // Copy files if patterns provided
      if (body.copyFiles) {
        try {
          copyFilesToWorktree(body.repoPath, body.worktreePath, body.copyFiles)
        } catch (err) {
          log.api.error('Failed to copy files', { error: String(err) })
          // Non-fatal: continue with task creation
        }
      }
    }

    db.insert(tasks).values(newTask).run()

    // Update lastUsedAt for the repository (if it exists in our database)
    if (body.repoPath) {
      db.update(repositories)
        .set({ lastUsedAt: now, updatedAt: now })
        .where(eq(repositories.path, body.repoPath))
        .run()
    }

    const created = db.select().from(tasks).where(eq(tasks.id, newTask.id)).get()
    broadcast({ type: 'task:updated', payload: { taskId: newTask.id } })
    return c.json(created ? parseViewState(created) : null, 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to create task' }, 400)
  }
})

// DELETE /api/tasks/bulk - Delete multiple tasks (must be before /:id route)
app.delete('/bulk', async (c) => {
  try {
    const body = await c.req.json<{ ids: string[]; deleteLinkedWorktrees?: boolean }>()

    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return c.json({ error: 'ids must be a non-empty array' }, 400)
    }

    const now = new Date().toISOString()
    let deletedCount = 0

    for (const id of body.ids) {
      const existing = db.select().from(tasks).where(eq(tasks.id, id)).get()
      if (!existing) continue

      // Handle linked worktree based on deleteLinkedWorktrees flag
      if (existing.worktreePath) {
        // Always destroy terminals for the worktree
        destroyTerminalsForWorktree(existing.worktreePath)

        // Only delete the worktree if flag is true
        if (body.deleteLinkedWorktrees && existing.repoPath) {
          deleteGitWorktree(existing.repoPath, existing.worktreePath)
        }
      }

      // Shift down tasks in the same column that were after this task
      const columnTasks = db.select().from(tasks).where(eq(tasks.status, existing.status)).all()

      for (const t of columnTasks) {
        if (t.position > existing.position) {
          db.update(tasks)
            .set({ position: t.position - 1, updatedAt: now })
            .where(eq(tasks.id, t.id))
            .run()
        }
      }

      db.delete(tasks).where(eq(tasks.id, id)).run()
      broadcast({ type: 'task:updated', payload: { taskId: id } })
      deletedCount++
    }

    return c.json({ success: true, deleted: deletedCount })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to delete tasks' }, 400)
  }
})

// GET /api/tasks/:id - Get single task
app.get('/:id', (c) => {
  const id = c.req.param('id')
  const task = db.select().from(tasks).where(eq(tasks.id, id)).get()
  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }
  return c.json(parseViewState(task))
})

// PATCH /api/tasks/:id - Update task
app.patch('/:id', async (c) => {
  const id = c.req.param('id')

  try {
    const existing = db.select().from(tasks).where(eq(tasks.id, id)).get()
    if (!existing) {
      return c.json({ error: 'Task not found' }, 404)
    }

    const body = await c.req.json<Partial<Task> & { viewState?: unknown }>()
    const now = new Date().toISOString()

    // Handle status change via centralized function (includes Linear sync)
    if (body.status && body.status !== existing.status) {
      await updateTaskStatus(id, body.status)
    }

    // Handle other updates (excluding status to avoid double-update)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { status: _status, ...otherFields } = body
    const updates: Record<string, unknown> = { ...otherFields, updatedAt: now }
    if (body.viewState !== undefined) {
      updates.viewState = body.viewState ? JSON.stringify(body.viewState) : null
    }

    // Only do additional db update if there are other fields to update
    if (Object.keys(otherFields).length > 0 || body.viewState !== undefined) {
      db.update(tasks)
        .set(updates)
        .where(eq(tasks.id, id))
        .run()
      broadcast({ type: 'task:updated', payload: { taskId: id } })
    }

    const updated = db.select().from(tasks).where(eq(tasks.id, id)).get()
    return c.json(updated ? parseViewState(updated) : null)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to update task' }, 400)
  }
})

// DELETE /api/tasks/:id - Delete task (optionally delete linked worktree)
app.delete('/:id', (c) => {
  const id = c.req.param('id')
  const deleteLinkedWorktree = c.req.query('deleteLinkedWorktree') === 'true'

  const existing = db.select().from(tasks).where(eq(tasks.id, id)).get()
  if (!existing) {
    return c.json({ error: 'Task not found' }, 404)
  }

  // Handle linked worktree based on deleteLinkedWorktree flag
  if (existing.worktreePath) {
    // Always destroy terminals for the worktree
    destroyTerminalsForWorktree(existing.worktreePath)

    // Only delete the worktree if flag is true
    if (deleteLinkedWorktree && existing.repoPath) {
      deleteGitWorktree(existing.repoPath, existing.worktreePath)
    }
  }

  // Shift down tasks in the same column that were after this task
  const columnTasks = db.select().from(tasks).where(eq(tasks.status, existing.status)).all()
  const now = new Date().toISOString()

  for (const t of columnTasks) {
    if (t.position > existing.position) {
      db.update(tasks)
        .set({ position: t.position - 1, updatedAt: now })
        .where(eq(tasks.id, t.id))
        .run()
    }
  }

  db.delete(tasks).where(eq(tasks.id, id)).run()
  broadcast({ type: 'task:updated', payload: { taskId: id } })
  return c.json({ success: true })
})

// PATCH /api/tasks/:id/status - Update task status with position reordering
app.patch('/:id/status', async (c) => {
  const id = c.req.param('id')

  try {
    const existing = db.select().from(tasks).where(eq(tasks.id, id)).get()
    if (!existing) {
      return c.json({ error: 'Task not found' }, 404)
    }

    const body = await c.req.json<{ status: string; position: number }>()
    const now = new Date().toISOString()

    // If status changed or position changed, we need to reorder
    const oldStatus = existing.status
    const newStatus = body.status
    const newPosition = body.position

    if (oldStatus !== newStatus) {
      // Moving to a different column
      // Shift down tasks in old column that were after this task
      const oldColumnTasks = db.select().from(tasks).where(eq(tasks.status, oldStatus)).all()
      for (const t of oldColumnTasks) {
        if (t.position > existing.position) {
          db.update(tasks)
            .set({ position: t.position - 1, updatedAt: now })
            .where(eq(tasks.id, t.id))
            .run()
        }
      }

      // Shift up tasks in new column to make room
      const newColumnTasks = db.select().from(tasks).where(eq(tasks.status, newStatus)).all()
      for (const t of newColumnTasks) {
        if (t.position >= newPosition) {
          db.update(tasks)
            .set({ position: t.position + 1, updatedAt: now })
            .where(eq(tasks.id, t.id))
            .run()
        }
      }
    } else {
      // Same column, just reorder
      const columnTasks = db.select().from(tasks).where(eq(tasks.status, oldStatus)).all()

      if (newPosition > existing.position) {
        // Moving down
        for (const t of columnTasks) {
          if (t.id !== id && t.position > existing.position && t.position <= newPosition) {
            db.update(tasks)
              .set({ position: t.position - 1, updatedAt: now })
              .where(eq(tasks.id, t.id))
              .run()
          }
        }
      } else if (newPosition < existing.position) {
        // Moving up
        for (const t of columnTasks) {
          if (t.id !== id && t.position >= newPosition && t.position < existing.position) {
            db.update(tasks)
              .set({ position: t.position + 1, updatedAt: now })
              .where(eq(tasks.id, t.id))
              .run()
          }
        }
      }
    }

    // Update the task status (handles all side effects: broadcast, Linear sync, notifications, killClaude)
    const updated = await updateTaskStatus(id, newStatus, newPosition)

    return c.json(updated ? parseViewState(updated) : null)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to update task status' }, 400)
  }
})

// POST /api/tasks/:id/kill-claude - Kill Claude processes in task terminals
app.post('/:id/kill-claude', (c) => {
  const id = c.req.param('id')
  const task = db.select().from(tasks).where(eq(tasks.id, id)).get()

  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  if (!task.worktreePath) {
    return c.json({ success: true, terminalsAffected: 0 })
  }

  try {
    const count = killClaudeInTerminalsForWorktree(task.worktreePath)
    return c.json({ success: true, terminalsAffected: count })
  } catch {
    return c.json({ success: true, terminalsAffected: 0 })
  }
})

export default app
