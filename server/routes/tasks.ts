import { Hono } from 'hono'
import { db, tasks, type Task, type NewTask } from '../db'
import { eq, asc } from 'drizzle-orm'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'
import { getPTYManager, destroyTerminalAndBroadcast } from '../terminal/pty-instance'
import { broadcast } from '../websocket/terminal-ws'
import { updateLinearTicketStatus } from '../services/linear'
import { updateTaskStatus } from '../services/task-status'
import { sendNotification } from '../services/notification-service'

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
      console.error(`Failed to copy files matching pattern "${pattern}":`, err)
      // Continue with other patterns
    }
  }
}

// Initialize worktree with CLAUDE.local.md for Vibora CLI integration
function initializeWorktreeForVibora(worktreePath: string): void {
  const claudeLocalPath = path.join(worktreePath, 'CLAUDE.local.md')
  const gitignorePath = path.join(worktreePath, '.gitignore')

  const viboraSection = `
## Vibora Task Management

You are working inside a Vibora task worktree. Use the \`vibora\` CLI to manage this task:

\`\`\`bash
# View current task info
vibora current-task

# Associate a PR with this task (enables auto-completion when merged)
vibora current-task pr https://github.com/owner/repo/pull/123

# Associate a Linear ticket with this task
vibora current-task linear https://linear.app/team/issue/TEAM-123

# Update task status when work is complete
vibora current-task review    # Ready for review
vibora current-task done      # Task complete
\`\`\`

When you create a PR for this work, run \`vibora current-task pr <url>\` to link it.
The task will automatically complete when the PR is merged.
`

  // Handle CLAUDE.local.md - create or append
  let claudeContent = ''
  if (fs.existsSync(claudeLocalPath)) {
    claudeContent = fs.readFileSync(claudeLocalPath, 'utf-8')
  }

  if (!claudeContent.includes('## Vibora Task Management')) {
    // Append with proper spacing
    const separator = claudeContent && !claudeContent.endsWith('\n') ? '\n' : ''
    fs.writeFileSync(claudeLocalPath, claudeContent + separator + viboraSection)
  }

  // Handle .gitignore - add CLAUDE.local.md if not present
  let gitignoreContent = ''
  if (fs.existsSync(gitignorePath)) {
    gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8')
  }

  const lines = gitignoreContent.split('\n')
  if (!lines.some((line) => line.trim() === 'CLAUDE.local.md')) {
    const separator = gitignoreContent && !gitignoreContent.endsWith('\n') ? '\n' : ''
    fs.writeFileSync(gitignorePath, gitignoreContent + separator + 'CLAUDE.local.md\n')
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
        initializeVibora?: boolean
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
      createdAt: now,
      updatedAt: now,
    }

    // Create git worktree if branch and worktreePath are provided
    if (body.branch && body.worktreePath && body.repoPath && body.baseBranch) {
      const result = createGitWorktree(body.repoPath, body.worktreePath, body.branch, body.baseBranch)
      if (!result.success) {
        return c.json({ error: `Failed to create worktree: ${result.error}` }, 500)
      }

      // Initialize worktree for Vibora CLI integration (default: true)
      if (body.initializeVibora !== false) {
        initializeWorktreeForVibora(body.worktreePath)
      }

      // Copy files if patterns provided
      if (body.copyFiles) {
        try {
          copyFilesToWorktree(body.repoPath, body.worktreePath, body.copyFiles)
        } catch (err) {
          console.error('Failed to copy files:', err)
          // Non-fatal: continue with task creation
        }
      }
    }

    db.insert(tasks).values(newTask).run()
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
    const body = await c.req.json<{ ids: string[] }>()

    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return c.json({ error: 'ids must be a non-empty array' }, 400)
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

// DELETE /api/tasks/:id - Delete task
app.delete('/:id', (c) => {
  const id = c.req.param('id')
  const existing = db.select().from(tasks).where(eq(tasks.id, id)).get()
  if (!existing) {
    return c.json({ error: 'Task not found' }, 404)
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
    broadcast({ type: 'task:updated', payload: { taskId: id } })

    // Sync status to Linear if task has a linked ticket and status changed
    if (oldStatus !== newStatus && existing.linearTicketId) {
      // Fire and forget - don't block the response
      updateLinearTicketStatus(existing.linearTicketId, newStatus).catch((err) => {
        console.error('Failed to update Linear ticket status:', err)
      })
    }

    // Send notification for specific status transitions
    if (oldStatus !== newStatus && updated) {
      if (newStatus === 'IN_REVIEW') {
        sendNotification({
          title: 'Task Ready for Review',
          message: `Task "${updated.title}" moved to review`,
          taskId: updated.id,
          taskTitle: updated.title,
          type: 'task_status_change',
        })
      } else if (newStatus === 'DONE') {
        sendNotification({
          title: 'Task Completed',
          message: `Task "${updated.title}" marked as done`,
          taskId: updated.id,
          taskTitle: updated.title,
          type: 'task_status_change',
        })
      }
    }

    return c.json(updated ? parseViewState(updated) : null)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to update task status' }, 400)
  }
})

export default app
