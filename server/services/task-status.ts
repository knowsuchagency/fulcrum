import { db, type Task, repositories } from '../db'
import { tasks, terminalViewState } from '../db/schema'
import { eq } from 'drizzle-orm'
import { broadcast } from '../websocket/terminal-ws'
import { sendNotification } from './notification-service'
import { killClaudeInTerminalsForWorktree } from '../terminal/pty-instance'
import { log } from '../lib/logger'
import { getWorktreeBasePath } from '../lib/settings'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'

// Helper to create git worktree (copied from tasks.ts for use in status transitions)
function createGitWorktree(
  repoPath: string,
  worktreePath: string,
  branch: string,
  baseBranch: string
): { success: boolean; error?: string } {
  try {
    const worktreeParent = path.dirname(worktreePath)
    if (!fs.existsSync(worktreeParent)) {
      fs.mkdirSync(worktreeParent, { recursive: true })
    }

    try {
      execSync(`git worktree add -b "${branch}" "${worktreePath}" "${baseBranch}"`, {
        cwd: repoPath,
        encoding: 'utf-8',
      })
    } catch {
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

// Helper to copy files to worktree
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

        if (fs.existsSync(destPath)) continue

        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true })
        }

        fs.copyFileSync(srcPath, destPath)
      }
    } catch (err) {
      log.api.error('Failed to copy files matching pattern', { pattern, error: String(err) })
    }
  }
}

// Generate worktree path and branch name for a task
function generateWorktreeInfo(
  repoPath: string,
  taskTitle: string
): { worktreePath: string; branch: string } {
  const worktreesDir = getWorktreeBasePath()

  // Generate branch name from task title
  const slugifiedTitle = taskTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)

  const suffix = Math.random().toString(36).slice(2, 6)
  const branch = `${slugifiedTitle}-${suffix}`
  const worktreeName = branch
  const repoName = path.basename(repoPath)
  const worktreePath = path.join(worktreesDir, repoName, worktreeName)

  return { worktreePath, branch }
}

/**
 * Centralized function to update task status.
 * This is the ONLY place task status should be updated.
 * Handles all side effects:
 * - Database update (status, position, updatedAt, startedAt)
 * - WebSocket broadcast
 * - Notifications (for IN_REVIEW only)
 * - Kill Claude processes (for DONE, CANCELED)
 * - Worktree creation (for TO_DO -> IN_PROGRESS on code tasks)
 */
export async function updateTaskStatus(
  taskId: string,
  newStatus: string,
  newPosition?: number
): Promise<Task | null> {
  const existing = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!existing) return null

  const oldStatus = existing.status
  const statusChanged = oldStatus !== newStatus

  // Build update object
  const now = new Date().toISOString()
  const updateData: { status: string; updatedAt: string; position?: number; startedAt?: string; worktreePath?: string; branch?: string; repoPath?: string; repoName?: string; baseBranch?: string } = {
    status: newStatus,
    updatedAt: now,
  }
  if (newPosition !== undefined) {
    updateData.position = newPosition
  }

  // Handle TO_DO -> IN_PROGRESS transition: set startedAt and create worktree if needed
  if (statusChanged && oldStatus === 'TO_DO' && newStatus === 'IN_PROGRESS') {
    updateData.startedAt = now

    // If task has repositoryId but no worktreePath, create worktree now
    if (existing.repositoryId && !existing.worktreePath) {
      const repo = db.select().from(repositories).where(eq(repositories.id, existing.repositoryId)).get()
      if (repo) {
        const { worktreePath, branch } = generateWorktreeInfo(repo.path, existing.title)

        // Get base branch (default to 'main')
        let baseBranch = 'main'
        try {
          const defaultBranch = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
            cwd: repo.path,
            encoding: 'utf-8',
          }).trim().replace('refs/remotes/origin/', '')
          if (defaultBranch) baseBranch = defaultBranch
        } catch {
          // Fallback to 'main' if can't detect
        }

        const result = createGitWorktree(repo.path, worktreePath, branch, baseBranch)
        if (result.success) {
          updateData.worktreePath = worktreePath
          updateData.branch = branch
          updateData.repoPath = repo.path
          updateData.repoName = repo.displayName
          updateData.baseBranch = baseBranch

          // Copy files if patterns configured
          if (repo.copyFiles) {
            try {
              copyFilesToWorktree(repo.path, worktreePath, repo.copyFiles)
            } catch (err) {
              log.api.error('Failed to copy files during status transition', { error: String(err) })
            }
          }
        } else {
          log.api.error('Failed to create worktree during status transition', { error: result.error })
        }
      }
    }
  }

  // Update database
  db.update(tasks)
    .set(updateData)
    .where(eq(tasks.id, taskId))
    .run()

  const updated = db.select().from(tasks).where(eq(tasks.id, taskId)).get()

  // Broadcast update via WebSocket
  broadcast({ type: 'task:updated', payload: { taskId } })

  // Only trigger side effects if status actually changed
  if (statusChanged && updated) {
    // Send notification when task moves to review (suppressed if user is actively viewing)
    if (newStatus === 'IN_REVIEW') {
      const STALE_MS = 5 * 60 * 1000 // 5 minutes

      // Check if user is actively viewing with visible tab
      const viewState = db
        .select()
        .from(terminalViewState)
        .where(eq(terminalViewState.id, 'singleton'))
        .get()

      const viewIsRecent =
        viewState?.viewUpdatedAt &&
        Date.now() - new Date(viewState.viewUpdatedAt).getTime() < STALE_MS
      const tabIsVisible = viewState?.isTabVisible === true
      const isViewingThisTask = viewState?.currentTaskId === taskId
      const isViewingAllTasks =
        viewState?.currentView === 'terminals' && viewState?.activeTabId === 'all-tasks'

      const shouldSuppress = viewIsRecent && tabIsVisible && (isViewingThisTask || isViewingAllTasks)

      if (!shouldSuppress) {
        sendNotification({
          title: 'Task Ready for Review',
          message: `Task "${updated.title}" moved to review`,
          taskId: updated.id,
          taskTitle: updated.title,
          type: 'task_status_change',
        })
      }
    }

    // Kill Claude processes for terminal statuses
    if ((newStatus === 'DONE' || newStatus === 'CANCELED') && updated.worktreePath) {
      try {
        killClaudeInTerminalsForWorktree(updated.worktreePath)
      } catch (err) {
        log.api.error('Failed to kill Claude in worktree', {
          worktreePath: updated.worktreePath,
          error: String(err),
        })
      }
    }
  }

  return updated ?? null
}
