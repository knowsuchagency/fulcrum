import { execSync } from 'child_process'
import { db } from '../db'
import { tasks } from '../db/schema'
import { eq, isNotNull, and, notInArray } from 'drizzle-orm'
import { broadcast } from '../websocket/terminal-ws'

const POLL_INTERVAL = 60_000 // 60 seconds

interface PRStatus {
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  merged: boolean
}

// Parse PR URL to extract owner/repo/number
// e.g., https://github.com/owner/repo/pull/123
function parsePrUrl(
  url: string
): { owner: string; repo: string; number: number } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) }
}

// Check PR status using gh CLI
function checkPrStatus(prUrl: string): PRStatus | null {
  const parsed = parsePrUrl(prUrl)
  if (!parsed) {
    console.warn(`Invalid PR URL format: ${prUrl}`)
    return null
  }

  try {
    const output = execSync(
      `gh pr view ${parsed.number} --repo ${parsed.owner}/${parsed.repo} --json state,merged`,
      { encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const data = JSON.parse(output)
    return {
      state: data.state,
      merged: data.merged ?? false,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Failed to check PR ${prUrl}: ${message}`)
    return null
  }
}

// Poll and update task statuses
async function pollPRs(): Promise<void> {
  // Get all tasks with prUrl that are not DONE or CANCELLED
  const tasksWithPR = db
    .select()
    .from(tasks)
    .where(
      and(
        isNotNull(tasks.prUrl),
        notInArray(tasks.status, ['DONE', 'CANCELLED'])
      )
    )
    .all()

  for (const task of tasksWithPR) {
    if (!task.prUrl) continue

    const status = checkPrStatus(task.prUrl)
    if (!status) continue

    // If PR is merged, mark task as DONE
    if (status.merged) {
      const now = new Date().toISOString()
      db.update(tasks)
        .set({ status: 'DONE', updatedAt: now })
        .where(eq(tasks.id, task.id))
        .run()

      broadcast({ type: 'task:updated', payload: { taskId: task.id } })
      console.log(`Task "${task.title}" marked as DONE (PR merged)`)
    }
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null

export function startPRMonitor(): void {
  if (intervalId) return // Already running

  console.log('PR Monitor started (60s interval)')

  // Run immediately on start
  pollPRs().catch(console.error)

  // Then poll every 60 seconds
  intervalId = setInterval(() => {
    pollPRs().catch(console.error)
  }, POLL_INTERVAL)
}

export function stopPRMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    console.log('PR Monitor stopped')
  }
}
