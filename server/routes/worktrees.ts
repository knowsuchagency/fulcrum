import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import * as fs from 'fs'
import * as path from 'path'
import { db, tasks } from '../db'
import { eq } from 'drizzle-orm'
import { getWorktreeBasePath } from '../lib/settings'
import { getPTYManager, destroyTerminalAndBroadcast } from '../terminal/pty-instance'
import type { WorktreeBasic, WorktreeDetails, WorktreesSummary } from '../../shared/types'

// Format bytes to human-readable string
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// Get directory size using du command (async)
async function getDirectorySizeAsync(dirPath: string): Promise<number> {
  try {
    const platform = process.platform
    const cmd = platform === 'darwin' ? ['du', '-sk', dirPath] : ['du', '-sb', dirPath]

    const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' })
    const output = await new Response(proc.stdout).text()
    const sizeValue = parseInt(output.split('\t')[0], 10)
    return platform === 'darwin' ? sizeValue * 1024 : sizeValue
  } catch {
    return 0
  }
}

// Get git branch for a worktree path (async)
async function getGitBranchAsync(gitPath: string): Promise<string> {
  try {
    const proc = Bun.spawn(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: gitPath,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const output = await new Response(proc.stdout).text()
    return output.trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

// Destroy terminals associated with a worktree path
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

// Delete git worktree (async)
async function deleteWorktree(worktreePath: string, repoPath?: string): Promise<void> {
  if (!fs.existsSync(worktreePath)) return

  // Try git worktree remove if we have the repo path
  if (repoPath && fs.existsSync(repoPath)) {
    try {
      const proc = Bun.spawn(['git', 'worktree', 'remove', worktreePath, '--force'], {
        cwd: repoPath,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      await proc.exited
      if (proc.exitCode === 0) return
    } catch {
      // Fall through to manual removal
    }
  }

  // Manual removal and prune
  fs.rmSync(worktreePath, { recursive: true, force: true })

  // Try to find the parent repo and prune
  if (repoPath && fs.existsSync(repoPath)) {
    try {
      Bun.spawn(['git', 'worktree', 'prune'], { cwd: repoPath })
    } catch {
      // Ignore prune errors
    }
  }
}

const app = new Hono()

// GET /api/worktrees - Stream worktrees via SSE for progressive loading
app.get('/', (c) => {
  return streamSSE(c, async (stream) => {
    const worktreeBasePath = getWorktreeBasePath()

    // Handle missing directory
    if (!fs.existsSync(worktreeBasePath)) {
      await stream.writeSSE({
        event: 'worktree:basic',
        data: JSON.stringify([]),
      })
      await stream.writeSSE({
        event: 'worktree:complete',
        data: JSON.stringify({
          total: 0,
          orphaned: 0,
          totalSize: 0,
          totalSizeFormatted: '0 B',
        } satisfies WorktreesSummary),
      })
      return
    }

    // Get all tasks to build a map of worktreePath -> task
    const allTasks = db.select().from(tasks).all()
    const worktreeToTask = new Map<string, (typeof allTasks)[0]>()
    for (const task of allTasks) {
      if (task.worktreePath) {
        worktreeToTask.set(task.worktreePath, task)
      }
    }

    // Read all directories in worktreeBasePath (fast operation)
    const entries = fs.readdirSync(worktreeBasePath, { withFileTypes: true })
    const basicWorktrees: WorktreeBasic[] = []
    const pathsToProcess: string[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const fullPath = path.join(worktreeBasePath, entry.name)

      // Check if it's a git worktree (has .git file or directory)
      const gitPath = path.join(fullPath, '.git')
      if (!fs.existsSync(gitPath)) continue

      const stats = fs.statSync(fullPath)
      const linkedTask = worktreeToTask.get(fullPath)

      basicWorktrees.push({
        path: fullPath,
        name: entry.name,
        lastModified: stats.mtime.toISOString(),
        isOrphaned: !linkedTask,
        taskId: linkedTask?.id,
        taskTitle: linkedTask?.title,
        taskStatus: linkedTask?.status,
        repoPath: linkedTask?.repoPath,
      })
      pathsToProcess.push(fullPath)
    }

    // Sort: orphaned first, then by last modified (newest first)
    basicWorktrees.sort((a, b) => {
      if (a.isOrphaned !== b.isOrphaned) {
        return a.isOrphaned ? -1 : 1
      }
      return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    })

    // Send basic info immediately
    await stream.writeSSE({
      event: 'worktree:basic',
      data: JSON.stringify(basicWorktrees),
    })

    // Process details in parallel with concurrency limit
    let totalSize = 0
    const CONCURRENCY = 4

    async function processWorktree(fullPath: string) {
      try {
        const [size, branch] = await Promise.all([
          getDirectorySizeAsync(fullPath),
          getGitBranchAsync(fullPath),
        ])
        totalSize += size

        await stream.writeSSE({
          event: 'worktree:details',
          data: JSON.stringify({
            path: fullPath,
            size,
            sizeFormatted: formatBytes(size),
            branch,
          } satisfies WorktreeDetails),
        })
      } catch (error) {
        await stream.writeSSE({
          event: 'worktree:error',
          data: JSON.stringify({
            path: fullPath,
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        })
      }
    }

    // Process in batches with concurrency limit
    for (let i = 0; i < pathsToProcess.length; i += CONCURRENCY) {
      const batch = pathsToProcess.slice(i, i + CONCURRENCY)
      await Promise.all(batch.map(processWorktree))
    }

    // Send completion summary
    await stream.writeSSE({
      event: 'worktree:complete',
      data: JSON.stringify({
        total: basicWorktrees.length,
        orphaned: basicWorktrees.filter((w) => w.isOrphaned).length,
        totalSize,
        totalSizeFormatted: formatBytes(totalSize),
      } satisfies WorktreesSummary),
    })
  })
})

// DELETE /api/worktrees - Delete a worktree and its linked task
app.delete('/', async (c) => {
  try {
    const body = await c.req.json<{ worktreePath: string; repoPath?: string }>()

    if (!body.worktreePath) {
      return c.json({ error: 'worktreePath is required' }, 400)
    }

    // Verify it's within the worktree base path for safety
    const worktreeBasePath = getWorktreeBasePath()
    const normalizedPath = path.normalize(body.worktreePath)
    if (!normalizedPath.startsWith(worktreeBasePath)) {
      return c.json({ error: 'Invalid worktree path' }, 400)
    }

    if (!fs.existsSync(body.worktreePath)) {
      return c.json({ error: 'Worktree not found' }, 404)
    }

    // Find the linked task
    const linkedTask = db
      .select()
      .from(tasks)
      .where(eq(tasks.worktreePath, body.worktreePath))
      .get()

    // Destroy any terminals using this worktree
    destroyTerminalsForWorktree(body.worktreePath)

    // Delete the worktree
    await deleteWorktree(body.worktreePath, body.repoPath || linkedTask?.repoPath)

    // Delete the linked task if it exists
    let deletedTaskId: string | undefined
    if (linkedTask) {
      // Shift down tasks in the same column that were after this task
      const columnTasks = db.select().from(tasks).where(eq(tasks.status, linkedTask.status)).all()
      const now = new Date().toISOString()

      for (const t of columnTasks) {
        if (t.position > linkedTask.position) {
          db.update(tasks)
            .set({ position: t.position - 1, updatedAt: now })
            .where(eq(tasks.id, t.id))
            .run()
        }
      }

      db.delete(tasks).where(eq(tasks.id, linkedTask.id)).run()
      deletedTaskId = linkedTask.id
    }

    return c.json({ success: true, path: body.worktreePath, deletedTaskId })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to delete worktree' }, 500)
  }
})

export default app
