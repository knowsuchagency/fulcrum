import { db } from '../db'
import { tasks } from '../db/schema'
import { eq } from 'drizzle-orm'
import { broadcast } from '../websocket/terminal-ws'
import { updateLinearTicketStatus } from './linear'

/**
 * Centralized function to update task status.
 * Handles database update, WebSocket broadcast, and Linear sync.
 */
export async function updateTaskStatus(taskId: string, newStatus: string): Promise<void> {
  const existing = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!existing) return

  const oldStatus = existing.status
  if (oldStatus === newStatus) return

  const now = new Date().toISOString()
  db.update(tasks)
    .set({ status: newStatus, updatedAt: now })
    .where(eq(tasks.id, taskId))
    .run()

  broadcast({ type: 'task:updated', payload: { taskId } })

  if (existing.linearTicketId) {
    updateLinearTicketStatus(existing.linearTicketId, newStatus).catch((err) => {
      console.error(`Failed to update Linear ticket ${existing.linearTicketId}:`, err)
    })
  }
}
