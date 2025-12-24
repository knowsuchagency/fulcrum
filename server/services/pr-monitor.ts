import { execSync } from 'child_process'
import { db } from '../db'
import { tasks } from '../db/schema'
import { isNotNull, and, notInArray } from 'drizzle-orm'
import { updateTaskStatus } from './task-status'
import { log } from '../lib/logger'

const POLL_INTERVAL = 60_000 // 60 seconds

interface PRStatus {
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  mergedAt: string | null
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
    log.pr.warn('Invalid PR URL format', { prUrl })
    return null
  }

  try {
    const output = execSync(
      `gh pr view ${parsed.number} --repo ${parsed.owner}/${parsed.repo} --json state,mergedAt`,
      { encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const data = JSON.parse(output)
    return {
      state: data.state,
      mergedAt: data.mergedAt ?? null,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.pr.error('Failed to check PR', { prUrl, error: message })
    return null
  }
}

// Poll and update task statuses
async function pollPRs(): Promise<void> {
  // Get all tasks with prUrl that are not DONE or CANCELED
  const tasksWithPR = db
    .select()
    .from(tasks)
    .where(
      and(
        isNotNull(tasks.prUrl),
        notInArray(tasks.status, ['DONE', 'CANCELED'])
      )
    )
    .all()

  for (const task of tasksWithPR) {
    if (!task.prUrl) continue

    const status = checkPrStatus(task.prUrl)
    if (!status) continue

    // If PR is merged (state is MERGED or mergedAt is set), mark task as DONE
    // The status change will trigger a notification via updateTaskStatus
    if (status.state === 'MERGED' || status.mergedAt) {
      await updateTaskStatus(task.id, 'DONE')
      log.pr.info('Task marked as DONE (PR merged)', { taskId: task.id, taskTitle: task.title })
    }
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null

export function startPRMonitor(): void {
  if (intervalId) return // Already running

  log.pr.info('PR Monitor started (60s interval)')

  // Run immediately on start
  pollPRs().catch((err) => log.pr.error('Poll failed', { error: String(err) }))

  // Then poll every 60 seconds
  intervalId = setInterval(() => {
    pollPRs().catch((err) => log.pr.error('Poll failed', { error: String(err) }))
  }, POLL_INTERVAL)
}

export function stopPRMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    log.pr.info('PR Monitor stopped')
  }
}
