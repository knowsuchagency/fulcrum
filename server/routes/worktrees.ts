import { Hono } from 'hono'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { db, tasks } from '../db'
import { eq } from 'drizzle-orm'
import { getSetting } from '../lib/settings'
import { getPTYManager, destroyTerminalAndBroadcast } from '../terminal/pty-instance'

interface WorktreeInfo {
  path: string
  name: string
  size: number
  sizeFormatted: string
  branch: string
  lastModified: string
  isOrphaned: boolean
  taskId?: string
  taskTitle?: string
  taskStatus?: string
  repoPath?: string
}

interface WorktreesResponse {
  worktrees: WorktreeInfo[]
  summary: {
    total: number
    orphaned: number
    totalSize: number
    totalSizeFormatted: string
  }
}

// Format bytes to human-readable string
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// Get directory size using du command
function getDirectorySize(dirPath: string): number {
  try {
    // Use du -sb on Linux, du -sk on macOS (multiply by 1024)
    const platform = process.platform
    if (platform === 'darwin') {
      const output = execSync(`du -sk "${dirPath}" 2>/dev/null`, { encoding: 'utf-8' })
      const sizeKb = parseInt(output.split('\t')[0], 10)
      return sizeKb * 1024
    } else {
      const output = execSync(`du -sb "${dirPath}" 2>/dev/null`, { encoding: 'utf-8' })
      return parseInt(output.split('\t')[0], 10)
    }
  } catch {
    return 0
  }
}

// Get git branch for a worktree path
function getGitBranch(gitPath: string): string {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: gitPath,
      encoding: 'utf-8',
    }).trim()
    return branch
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

// Delete git worktree
function deleteWorktree(worktreePath: string, repoPath?: string): void {
  if (!fs.existsSync(worktreePath)) return

  // Try git worktree remove if we have the repo path
  if (repoPath && fs.existsSync(repoPath)) {
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, {
        cwd: repoPath,
        encoding: 'utf-8',
      })
      return
    } catch {
      // Fall through to manual removal
    }
  }

  // Manual removal and prune
  fs.rmSync(worktreePath, { recursive: true, force: true })

  // Try to find the parent repo and prune
  if (repoPath && fs.existsSync(repoPath)) {
    try {
      execSync('git worktree prune', { cwd: repoPath, encoding: 'utf-8' })
    } catch {
      // Ignore prune errors
    }
  }
}

const app = new Hono()

// GET /api/worktrees - List all worktrees
app.get('/', (c) => {
  const worktreeBasePath = getSetting('worktreeBasePath')

  // Check if base path exists
  if (!fs.existsSync(worktreeBasePath)) {
    const response: WorktreesResponse = {
      worktrees: [],
      summary: {
        total: 0,
        orphaned: 0,
        totalSize: 0,
        totalSizeFormatted: '0 B',
      },
    }
    return c.json(response)
  }

  // Get all tasks to build a map of worktreePath -> task
  const allTasks = db.select().from(tasks).all()
  const worktreeToTask = new Map<string, (typeof allTasks)[0]>()
  for (const task of allTasks) {
    if (task.worktreePath) {
      worktreeToTask.set(task.worktreePath, task)
    }
  }

  // Read all directories in worktreeBasePath
  const entries = fs.readdirSync(worktreeBasePath, { withFileTypes: true })
  const worktrees: WorktreeInfo[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const fullPath = path.join(worktreeBasePath, entry.name)

    // Check if it's a git worktree (has .git file or directory)
    const gitPath = path.join(fullPath, '.git')
    if (!fs.existsSync(gitPath)) continue

    // Get worktree info
    const size = getDirectorySize(fullPath)
    const branch = getGitBranch(fullPath)
    const stats = fs.statSync(fullPath)
    const linkedTask = worktreeToTask.get(fullPath)

    worktrees.push({
      path: fullPath,
      name: entry.name,
      size,
      sizeFormatted: formatBytes(size),
      branch,
      lastModified: stats.mtime.toISOString(),
      isOrphaned: !linkedTask,
      taskId: linkedTask?.id,
      taskTitle: linkedTask?.title,
      taskStatus: linkedTask?.status,
      repoPath: linkedTask?.repoPath,
    })
  }

  // Sort: orphaned first, then by last modified (newest first)
  worktrees.sort((a, b) => {
    if (a.isOrphaned !== b.isOrphaned) {
      return a.isOrphaned ? -1 : 1
    }
    return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  })

  const totalSize = worktrees.reduce((sum, w) => sum + w.size, 0)
  const orphanedCount = worktrees.filter((w) => w.isOrphaned).length

  const response: WorktreesResponse = {
    worktrees,
    summary: {
      total: worktrees.length,
      orphaned: orphanedCount,
      totalSize,
      totalSizeFormatted: formatBytes(totalSize),
    },
  }

  return c.json(response)
})

// DELETE /api/worktrees - Delete a worktree and its linked task
app.delete('/', async (c) => {
  try {
    const body = await c.req.json<{ worktreePath: string; repoPath?: string }>()

    if (!body.worktreePath) {
      return c.json({ error: 'worktreePath is required' }, 400)
    }

    // Verify it's within the worktree base path for safety
    const worktreeBasePath = getSetting('worktreeBasePath')
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
    deleteWorktree(body.worktreePath, body.repoPath || linkedTask?.repoPath)

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
