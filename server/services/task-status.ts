import { db, type Task } from '../db'
import { tasks } from '../db/schema'
import { eq } from 'drizzle-orm'
import { broadcast } from '../websocket/terminal-ws'
import { updateLinearTicketStatus } from './linear'
import { sendNotification } from './notification-service'
import { killClaudeInTerminalsForWorktree } from '../terminal/pty-instance'

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
        console.error(`Failed to update Linear ticket ${existing.linearTicketId}:`, err)
      })
    }

    // Send notification when task moves to review (debounced to avoid spam from rapid status changes)
    if (newStatus === 'IN_REVIEW') {
      const DEBOUNCE_MS = 30 * 60 * 1000 // 30 minutes
      const nowMs = Date.now()
      const lastNotified = existing.lastReviewNotifiedAt
        ? new Date(existing.lastReviewNotifiedAt).getTime()
        : 0

      if (nowMs - lastNotified > DEBOUNCE_MS) {
        db.update(tasks)
          .set({ lastReviewNotifiedAt: new Date().toISOString() })
          .where(eq(tasks.id, taskId))
          .run()

        sendNotification({
          title: 'Task Ready for Review',
          message: `Task "${updated.title}" moved to review`,
          taskId: updated.id,
          taskTitle: updated.title,
          type: 'task_status_change',
        })
      }
    }

    // Clear notification debounce on terminal states (allows fresh notification if reopened)
    if (newStatus === 'DONE' || newStatus === 'CANCELED') {
      db.update(tasks)
        .set({ lastReviewNotifiedAt: null })
        .where(eq(tasks.id, taskId))
        .run()
    }

    // Kill Claude processes for terminal statuses
    if ((newStatus === 'DONE' || newStatus === 'CANCELED') && updated.worktreePath) {
      try {
        killClaudeInTerminalsForWorktree(updated.worktreePath)
      } catch (err) {
        console.error(`Failed to kill Claude in worktree ${updated.worktreePath}:`, err)
      }
    }
  }

  return updated ?? null
}
