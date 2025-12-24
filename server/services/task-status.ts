import { db, type Task } from '../db'
import { tasks, terminalViewState } from '../db/schema'
import { eq } from 'drizzle-orm'
import { broadcast } from '../websocket/terminal-ws'
import { updateLinearTicketStatus } from './linear'
import { sendNotification } from './notification-service'
import { killClaudeInTerminalsForWorktree } from '../terminal/pty-instance'
import { log } from '../lib/logger'

/**
 * Centralized function to update task status.
 * This is the ONLY place task status should be updated.
 * Handles all side effects:
 * - Database update (status, position, updatedAt)
 * - WebSocket broadcast
 * - Linear ticket sync
 * - Notifications (for IN_REVIEW only)
 * - Kill Claude processes (for DONE, CANCELED)
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
  const updateData: { status: string; updatedAt: string; position?: number } = {
    status: newStatus,
    updatedAt: now,
  }
  if (newPosition !== undefined) {
    updateData.position = newPosition
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
    // Sync to Linear if linked
    if (existing.linearTicketId) {
      updateLinearTicketStatus(existing.linearTicketId, newStatus).catch((err) => {
        log.api.error('Failed to update Linear ticket', {
          linearTicketId: existing.linearTicketId,
          error: String(err),
        })
      })
    }

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
