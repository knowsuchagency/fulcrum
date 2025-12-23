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
 * - Notifications (for IN_REVIEW, DONE)
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

    // Send notifications for specific status transitions
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
