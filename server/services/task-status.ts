import { db, type Task, repositories } from '../db'
import { tasks, taskTags, terminalViewState } from '../db/schema'
import { eq } from 'drizzle-orm'
import { broadcast } from '../websocket/terminal-ws'
import { sendNotification } from './notification-service'
import { killClaudeInTerminalsForWorktree } from '../terminal/pty-instance'
import { log } from '../lib/logger'
import { getWorktreeBasePath, getScratchBasePath, getSettings } from '../lib/settings'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'
import { calculateNextDueDate, getTodayInTimezone } from '../../shared/date-utils'
import type { RecurrenceRule } from '../../shared/types'

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

// Generate scratch directory path for a task
function generateScratchDirInfo(taskTitle: string): { dirPath: string } {
  const scratchDir = getScratchBasePath()

  const slugifiedTitle = taskTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)

  const suffix = Math.random().toString(36).slice(2, 6)
  const dirName = `${slugifiedTitle}-${suffix}`
  const dirPath = path.join(scratchDir, dirName)

  return { dirPath }
}

/**
 * Create the next recurrence of a completed repeating task.
 * Copies key fields from the completed task and sets a new due date.
 */
function createNextRecurrence(completedTask: Task): void {
  try {
    const rule = completedTask.recurrenceRule as RecurrenceRule
    if (!rule) return

    let nextDueDate = calculateNextDueDate(completedTask.dueDate, rule)

    // If the base date was far in the past, advance until we reach today or later
    const today = getTodayInTimezone(null)
    while (nextDueDate < today) {
      nextDueDate = calculateNextDueDate(nextDueDate, rule)
    }

    // Check if next date is past the end date
    if (completedTask.recurrenceEndDate && nextDueDate > completedTask.recurrenceEndDate) {
      log.api.info('Recurrence end date reached, not creating next task', {
        taskId: completedTask.id,
        nextDueDate,
        endDate: completedTask.recurrenceEndDate,
      })
      return
    }

    const now = new Date().toISOString()
    const newTaskId = crypto.randomUUID()

    // Get max position for TO_DO column
    const existingTasks = db
      .select()
      .from(tasks)
      .where(eq(tasks.status, 'TO_DO'))
      .all()
    const maxPosition = existingTasks.reduce((max, t) => Math.max(max, t.position), -1)

    // Create the new task
    db.insert(tasks)
      .values({
        id: newTaskId,
        title: completedTask.title,
        description: completedTask.description,
        status: 'TO_DO',
        position: maxPosition + 1,
        projectId: completedTask.projectId,
        notes: completedTask.notes,
        dueDate: nextDueDate,
        timeEstimate: completedTask.timeEstimate,
        priority: completedTask.priority,
        recurrenceRule: completedTask.recurrenceRule,
        recurrenceEndDate: completedTask.recurrenceEndDate,
        recurrenceSourceTaskId: completedTask.id,
        agent: completedTask.agent || 'claude',
        createdAt: now,
        updatedAt: now,
      })
      .run()

    // Copy tags from completed task
    const completedTaskTags = db
      .select()
      .from(taskTags)
      .where(eq(taskTags.taskId, completedTask.id))
      .all()

    for (const tt of completedTaskTags) {
      db.insert(taskTags)
        .values({
          id: crypto.randomUUID(),
          taskId: newTaskId,
          tagId: tt.tagId,
          createdAt: now,
        })
        .run()
    }

    broadcast({ type: 'task:updated', payload: { taskId: newTaskId } })

    log.api.info('Created next recurrence', {
      completedTaskId: completedTask.id,
      newTaskId,
      nextDueDate,
      rule,
    })
  } catch (err) {
    log.api.error('Failed to create next recurrence', {
      taskId: completedTask.id,
      error: String(err),
    })
  }
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
  const updateData: { status: string; updatedAt: string; position?: number; startedAt?: string; pinned?: boolean; worktreePath?: string; branch?: string; repoPath?: string; repoName?: string; baseBranch?: string } = {
    status: newStatus,
    updatedAt: now,
  }
  if (newPosition !== undefined) {
    updateData.position = newPosition
  }

  // Auto-unpin when moving to terminal statuses
  if (statusChanged && (newStatus === 'DONE' || newStatus === 'CANCELED') && existing.pinned) {
    updateData.pinned = false
  }

  // Handle TO_DO -> IN_PROGRESS transition: set startedAt and create worktree if needed
  if (statusChanged && oldStatus === 'TO_DO' && newStatus === 'IN_PROGRESS') {
    updateData.startedAt = now

    // If task has repositoryId but no worktreePath, create worktree now
    if (existing.repositoryId && !existing.worktreePath) {
      const repo = db.select().from(repositories).where(eq(repositories.id, existing.repositoryId)).get()
      if (repo) {
        const { worktreePath, branch } = generateWorktreeInfo(repo.path, existing.title)

        // Resolve base branch with priority:
        // 1. Task's explicit baseBranch (user's choice)
        // 2. Repo's defaultBaseBranch (repo-level config)
        // 3. Repo's lastBaseBranch (remember last used)
        // 4. Git-derived default (local or remote based on setting)
        // 5. 'main' fallback
        let baseBranch = existing.baseBranch
          || repo.defaultBaseBranch
          || repo.lastBaseBranch

          if (!baseBranch) {
          const settings = getSettings()
          const preferRemote = settings.tasks.preferRemoteBranches

          let localDefault = 'main'
          try {
            localDefault = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
              cwd: repo.path,
              encoding: 'utf-8',
            }).trim().replace('refs/remotes/origin/', '') || 'main'
          } catch {
            try {
              localDefault = execSync('git rev-parse --abbrev-ref HEAD', {
                cwd: repo.path,
                encoding: 'utf-8',
              }).trim() || 'main'
            } catch {
              // Keep 'main' as fallback
            }
          }

          if (preferRemote) {
            const remoteRef = `origin/${localDefault}`
            try {
              execSync(`git rev-parse --verify ${remoteRef}`, {
                cwd: repo.path,
                stdio: 'ignore',
              })
              baseBranch = remoteRef
            } catch {
              baseBranch = localDefault
            }
          } else {
            baseBranch = localDefault
          }
        }

        const result = createGitWorktree(repo.path, worktreePath, branch, baseBranch)
        if (result.success) {
          updateData.worktreePath = worktreePath
          updateData.branch = branch
          updateData.repoPath = repo.path
          updateData.repoName = repo.displayName
          updateData.baseBranch = baseBranch

          db.update(repositories)
            .set({ lastBaseBranch: baseBranch, updatedAt: now })
            .where(eq(repositories.id, repo.id))
            .run()

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

    // If task is scratch type but no worktreePath, create scratch directory now
    if (existing.type === 'scratch' && !existing.worktreePath) {
      const { dirPath } = generateScratchDirInfo(existing.title)
      try {
        fs.mkdirSync(dirPath, { recursive: true })
        updateData.worktreePath = dirPath
      } catch (err) {
        log.api.error('Failed to create scratch directory during status transition', { error: String(err) })
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

    // Create next recurrence when a repeating task is completed
    if (newStatus === 'DONE' && updated.recurrenceRule) {
      createNextRecurrence(updated)
    }
  }

  return updated ?? null
}
