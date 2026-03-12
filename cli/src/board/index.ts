/**
 * Agent Coordination Board - Core Operations
 *
 * Filesystem-based message board using one JSON file per message.
 * No server dependency — works when Fulcrum server is down.
 *
 * Directory: ~/.fulcrum/board/messages/
 * Filename: {unix-ms}-{4-char-id}.json
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getFulcrumDir } from '../utils/server'
import type { BoardMessage, PostMessageInput, ReadOptions, MessageType, AgentType } from './types'
import { DEFAULT_TTLS } from './types'

// ============================================================================
// Path helpers
// ============================================================================

export function getBoardDir(): string {
  return join(getFulcrumDir(), 'board', 'messages')
}

export function getRefsDir(): string {
  return join(getFulcrumDir(), 'board', 'refs')
}

export function ensureBoardDirs(): void {
  mkdirSync(getBoardDir(), { recursive: true })
  mkdirSync(getRefsDir(), { recursive: true })
}

// ============================================================================
// ID generation
// ============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 6)
}

// ============================================================================
// Context detection (best-effort, fail gracefully)
// ============================================================================

function detectAgent(): AgentType {
  if (process.env.CLAUDE_CODE) return 'claude'
  // Check if running inside a Claude Code session
  if (process.env.CLAUDE_CODE_ENTRY_POINT) return 'claude'
  return 'unknown'
}

interface TaskContext {
  taskId?: string
  taskTitle?: string
  project?: string
  repository?: string
  worktree?: string
}

async function getTaskContext(): Promise<TaskContext> {
  const taskId = process.env.FULCRUM_TASK_ID
  if (!taskId) return {}

  // Best-effort: try to fetch task details from the server
  try {
    const { FulcrumClient } = await import('../client')
    const client = new FulcrumClient()
    const task = await client.getTask(taskId)
    return {
      taskId,
      taskTitle: task.title,
      project: task.projectId ?? undefined,
      repository: task.repoName ?? undefined,
      worktree: task.worktreePath ?? undefined,
    }
  } catch {
    // Server might be down or task not found — return what we have
    return { taskId }
  }
}

// ============================================================================
// Duration parsing
// ============================================================================

/** Parse a duration string like "1h", "30m", "2h30m" into seconds */
export function parseDuration(duration: string): number {
  let seconds = 0
  const hourMatch = duration.match(/(\d+)h/)
  const minuteMatch = duration.match(/(\d+)m/)
  const secondMatch = duration.match(/(\d+)s/)

  if (hourMatch) seconds += parseInt(hourMatch[1], 10) * 3600
  if (minuteMatch) seconds += parseInt(minuteMatch[1], 10) * 60
  if (secondMatch) seconds += parseInt(secondMatch[1], 10)

  // If no unit matched, treat as seconds
  if (seconds === 0 && /^\d+$/.test(duration)) {
    seconds = parseInt(duration, 10)
  }

  return seconds || 3600 // default 1h if nothing parsed
}

// ============================================================================
// Core operations
// ============================================================================

/**
 * Read messages from the board, with optional filtering.
 * Opportunistically cleans expired messages.
 */
export function readBoard(options: ReadOptions = {}): BoardMessage[] {
  const dir = getBoardDir()
  if (!existsSync(dir)) return []

  const now = Date.now()
  const sinceMs = options.since ? now - parseDuration(options.since) * 1000 : now - 3600000 // default: last 1h
  const limit = options.limit ?? 50

  let entries: string[]
  try {
    entries = readdirSync(dir).filter(f => f.endsWith('.json')).sort()
  } catch {
    return []
  }

  const messages: BoardMessage[] = []
  const expired: string[] = []

  for (const filename of entries) {
    // Parse timestamp from filename for quick pre-filtering
    const tsStr = filename.split('-')[0]
    const fileTs = parseInt(tsStr, 10)

    // Skip files older than our filter window (they might still be valid for cleanup)
    const filePath = join(dir, filename)

    try {
      const content = readFileSync(filePath, 'utf-8')
      const msg: BoardMessage = JSON.parse(content)

      // Check expiry
      const msgTs = new Date(msg.timestamp).getTime()
      const expiresAt = msgTs + msg.ttl * 1000
      if (expiresAt < now) {
        expired.push(filePath)
        continue
      }

      // Apply filters
      if (fileTs < sinceMs) continue
      if (options.type && msg.type !== options.type) continue
      if (options.project && msg.project !== options.project) continue
      if (options.tag && (!msg.tags || !msg.tags.includes(options.tag))) continue

      messages.push(msg)
    } catch {
      // Corrupted file — skip it
    }
  }

  // Opportunistic cleanup of expired messages
  for (const path of expired) {
    try { unlinkSync(path) } catch { /* ignore */ }
  }

  // Return newest first, limited
  return messages.reverse().slice(0, limit)
}

/**
 * Post a message to the board.
 * Auto-populates context from environment (best-effort).
 */
export async function postMessage(input: PostMessageInput): Promise<BoardMessage> {
  ensureBoardDirs()

  const id = generateId()
  const now = new Date()
  const type: MessageType = input.type ?? 'info'
  const ttl = input.ttl ?? DEFAULT_TTLS[type]

  // Auto-populate context
  const context = await getTaskContext()
  const agent = detectAgent()

  const message: BoardMessage = {
    id,
    timestamp: now.toISOString(),
    type,
    agent,
    ...context,
    ttl,
    body: input.body,
    tags: input.tags,
  }

  // Handle ref content (large data stored separately)
  if (input.refContent) {
    const refFilename = `${id}-ref.txt`
    const refPath = join(getRefsDir(), refFilename)
    writeFileSync(refPath, input.refContent, 'utf-8')
    message.refs = [refFilename]
  }

  // Atomic write: write to temp, then rename
  const filename = `${now.getTime()}-${id}.json`
  const finalPath = join(getBoardDir(), filename)
  const tempPath = join(tmpdir(), `fulcrum-board-${filename}`)

  writeFileSync(tempPath, JSON.stringify(message, null, 2), 'utf-8')
  renameSync(tempPath, finalPath)

  return message
}

/**
 * Check if a resource is claimed by another agent.
 * Returns the active claim if found, null if resource is free.
 */
export function checkResource(resource: string): BoardMessage | null {
  const dir = getBoardDir()
  if (!existsSync(dir)) return null

  const now = Date.now()
  let entries: string[]
  try {
    entries = readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse()
  } catch {
    return null
  }

  for (const filename of entries) {
    const filePath = join(dir, filename)
    try {
      const content = readFileSync(filePath, 'utf-8')
      const msg: BoardMessage = JSON.parse(content)

      // Only check claims
      if (msg.type !== 'claim') continue

      // Check if expired
      const msgTs = new Date(msg.timestamp).getTime()
      if (msgTs + msg.ttl * 1000 < now) continue

      // Check if this claim matches the resource tag
      if (msg.tags && msg.tags.includes(resource)) {
        return msg
      }
    } catch {
      // Skip corrupted files
    }
  }

  return null
}

/**
 * Release all claims by a specific task.
 * Used by the Stop hook to auto-release resources when an agent exits.
 */
export function releaseAllByTask(taskId: string): number {
  const dir = getBoardDir()
  if (!existsSync(dir)) return 0

  let entries: string[]
  try {
    entries = readdirSync(dir).filter(f => f.endsWith('.json'))
  } catch {
    return 0
  }

  let deleted = 0
  for (const filename of entries) {
    const filePath = join(dir, filename)
    try {
      const content = readFileSync(filePath, 'utf-8')
      const msg: BoardMessage = JSON.parse(content)
      if (msg.type === 'claim' && msg.taskId === taskId) {
        unlinkSync(filePath)
        deleted++
      }
    } catch {
      // Skip
    }
  }

  return deleted
}

/**
 * Clean expired (or all) messages from the board.
 * Returns the count of deleted messages.
 */
export function cleanBoard(all?: boolean): number {
  const dir = getBoardDir()
  if (!existsSync(dir)) return 0

  let entries: string[]
  try {
    entries = readdirSync(dir).filter(f => f.endsWith('.json'))
  } catch {
    return 0
  }

  const now = Date.now()
  let deleted = 0

  for (const filename of entries) {
    const filePath = join(dir, filename)
    if (all) {
      try { unlinkSync(filePath); deleted++ } catch { /* ignore */ }
      continue
    }

    try {
      const content = readFileSync(filePath, 'utf-8')
      const msg: BoardMessage = JSON.parse(content)
      const msgTs = new Date(msg.timestamp).getTime()
      if (msgTs + msg.ttl * 1000 < now) {
        unlinkSync(filePath)
        deleted++
      }
    } catch {
      // Corrupted — delete it
      try { unlinkSync(filePath); deleted++ } catch { /* ignore */ }
    }
  }

  // Also clean orphaned refs if cleaning all
  if (all) {
    const refsDir = getRefsDir()
    if (existsSync(refsDir)) {
      try {
        for (const ref of readdirSync(refsDir)) {
          try { unlinkSync(join(refsDir, ref)); deleted++ } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }
  }

  return deleted
}
