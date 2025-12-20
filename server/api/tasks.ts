import { db, tasks, type Task, type NewTask } from '../db'
import { eq, asc } from 'drizzle-orm'
import type { IncomingMessage, ServerResponse } from 'http'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { getPTYManager, destroyTerminalAndBroadcast } from '../terminal/pty-instance'

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

// Helper to parse JSON body
async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

// Helper to send JSON response
function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

// Helper to send error
function error(res: ServerResponse, message: string, status = 400) {
  json(res, { error: message }, status)
}

// GET /api/tasks - List all tasks
export function listTasks(req: IncomingMessage, res: ServerResponse) {
  const allTasks = db.select().from(tasks).orderBy(asc(tasks.position)).all()
  json(res, allTasks)
}

// GET /api/tasks/:id - Get single task
export function getTask(req: IncomingMessage, res: ServerResponse, id: string) {
  const task = db.select().from(tasks).where(eq(tasks.id, id)).get()
  if (!task) {
    return error(res, 'Task not found', 404)
  }
  json(res, task)
}

// POST /api/tasks - Create task
export async function createTask(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await parseBody<Omit<NewTask, 'id' | 'createdAt' | 'updatedAt'>>(req)

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
      createdAt: now,
      updatedAt: now,
    }

    // Create git worktree if branch and worktreePath are provided
    if (body.branch && body.worktreePath && body.repoPath && body.baseBranch) {
      const result = createGitWorktree(
        body.repoPath,
        body.worktreePath,
        body.branch,
        body.baseBranch
      )
      if (!result.success) {
        return error(res, `Failed to create worktree: ${result.error}`, 500)
      }
    }

    db.insert(tasks).values(newTask).run()
    const created = db.select().from(tasks).where(eq(tasks.id, newTask.id)).get()
    json(res, created, 201)
  } catch (err) {
    error(res, err instanceof Error ? err.message : 'Failed to create task', 400)
  }
}

// PATCH /api/tasks/:id - Update task
export async function updateTask(req: IncomingMessage, res: ServerResponse, id: string) {
  try {
    const existing = db.select().from(tasks).where(eq(tasks.id, id)).get()
    if (!existing) {
      return error(res, 'Task not found', 404)
    }

    const body = await parseBody<Partial<Task>>(req)
    const now = new Date().toISOString()

    db.update(tasks)
      .set({
        ...body,
        updatedAt: now,
      })
      .where(eq(tasks.id, id))
      .run()

    const updated = db.select().from(tasks).where(eq(tasks.id, id)).get()
    json(res, updated)
  } catch (err) {
    error(res, err instanceof Error ? err.message : 'Failed to update task', 400)
  }
}

// PATCH /api/tasks/:id/status - Update task status with position reordering
export async function updateTaskStatus(
  req: IncomingMessage,
  res: ServerResponse,
  id: string
) {
  try {
    const existing = db.select().from(tasks).where(eq(tasks.id, id)).get()
    if (!existing) {
      return error(res, 'Task not found', 404)
    }

    const body = await parseBody<{ status: string; position: number }>(req)
    const now = new Date().toISOString()

    // If status changed or position changed, we need to reorder
    const oldStatus = existing.status
    const newStatus = body.status
    const newPosition = body.position

    if (oldStatus !== newStatus) {
      // Moving to a different column
      // Shift down tasks in old column that were after this task
      const oldColumnTasks = db
        .select()
        .from(tasks)
        .where(eq(tasks.status, oldStatus))
        .all()
      for (const t of oldColumnTasks) {
        if (t.position > existing.position) {
          db.update(tasks)
            .set({ position: t.position - 1, updatedAt: now })
            .where(eq(tasks.id, t.id))
            .run()
        }
      }

      // Shift up tasks in new column to make room
      const newColumnTasks = db
        .select()
        .from(tasks)
        .where(eq(tasks.status, newStatus))
        .all()
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
      const columnTasks = db
        .select()
        .from(tasks)
        .where(eq(tasks.status, oldStatus))
        .all()

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

    // Update the task itself
    db.update(tasks)
      .set({
        status: newStatus,
        position: newPosition,
        updatedAt: now,
      })
      .where(eq(tasks.id, id))
      .run()

    const updated = db.select().from(tasks).where(eq(tasks.id, id)).get()
    json(res, updated)
  } catch (err) {
    error(res, err instanceof Error ? err.message : 'Failed to update task status', 400)
  }
}

// DELETE /api/tasks/bulk - Delete multiple tasks
export async function bulkDeleteTasks(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await parseBody<{ ids: string[] }>(req)

    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return error(res, 'ids must be a non-empty array')
    }

    const now = new Date().toISOString()
    let deletedCount = 0

    for (const id of body.ids) {
      const existing = db.select().from(tasks).where(eq(tasks.id, id)).get()
      if (!existing) continue

      // Destroy terminals associated with this task's worktree
      if (existing.worktreePath) {
        destroyTerminalsForWorktree(existing.worktreePath)
      }

      // Delete git worktree if it exists
      if (existing.worktreePath && existing.repoPath) {
        deleteGitWorktree(existing.repoPath, existing.worktreePath)
      }

      // Shift down tasks in the same column that were after this task
      const columnTasks = db
        .select()
        .from(tasks)
        .where(eq(tasks.status, existing.status))
        .all()

      for (const t of columnTasks) {
        if (t.position > existing.position) {
          db.update(tasks)
            .set({ position: t.position - 1, updatedAt: now })
            .where(eq(tasks.id, t.id))
            .run()
        }
      }

      db.delete(tasks).where(eq(tasks.id, id)).run()
      deletedCount++
    }

    json(res, { success: true, deleted: deletedCount })
  } catch (err) {
    error(res, err instanceof Error ? err.message : 'Failed to delete tasks', 400)
  }
}

// DELETE /api/tasks/:id - Delete task
export function deleteTask(req: IncomingMessage, res: ServerResponse, id: string) {
  const existing = db.select().from(tasks).where(eq(tasks.id, id)).get()
  if (!existing) {
    return error(res, 'Task not found', 404)
  }

  // Destroy terminals associated with this task's worktree
  if (existing.worktreePath) {
    destroyTerminalsForWorktree(existing.worktreePath)
  }

  // Delete git worktree if it exists
  if (existing.worktreePath && existing.repoPath) {
    deleteGitWorktree(existing.repoPath, existing.worktreePath)
  }

  // Shift down tasks in the same column that were after this task
  const columnTasks = db
    .select()
    .from(tasks)
    .where(eq(tasks.status, existing.status))
    .all()
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
  json(res, { success: true })
}
