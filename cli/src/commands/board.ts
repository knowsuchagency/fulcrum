/**
 * CLI command: fulcrum board
 *
 * Lightweight agent coordination board for multi-agent environments.
 * All operations are filesystem-based — no server dependency.
 */

import { defineCommand } from 'citty'
import { readBoard, postMessage, checkResource, releaseAllByTask, cleanBoard } from '../board'
import type { BoardMessage, MessageType } from '../board/types'
import { setupJsonOutput } from './shared'
import { output, isJsonOutput, prettyLog } from '../utils/output'

// ============================================================================
// Formatters
// ============================================================================

function formatMessage(msg: BoardMessage): void {
  const age = getAge(msg.timestamp)
  const typeColor: Record<string, string> = {
    claim: '[CLAIM]',
    release: '[RELEASE]',
    info: '[INFO]',
    warning: '[WARNING]',
    request: '[REQUEST]',
  }
  const prefix = typeColor[msg.type] ?? `[${msg.type.toUpperCase()}]`
  const agent = msg.agent !== 'unknown' ? ` (${msg.agent})` : ''
  const task = msg.taskTitle ? ` | ${msg.taskTitle}` : ''
  const tags = msg.tags?.length ? ` [${msg.tags.join(', ')}]` : ''

  console.log(`${prefix} ${msg.body}${agent}${task}${tags} (${age} ago)`)
}

function getAge(timestamp: string): string {
  const ms = Date.now() - new Date(timestamp).getTime()
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (remainingMinutes > 0) return `${hours}h${remainingMinutes}m`
  return `${hours}h`
}

// ============================================================================
// Subcommands
// ============================================================================

const readCommand = defineCommand({
  meta: { name: 'read', description: 'Read recent messages from the coordination board' },
  args: {
    since: { type: 'string' as const, description: 'Time window (e.g., 1h, 30m, 2h). Default: 1h' },
    type: { type: 'string' as const, description: 'Filter by type: claim, release, info, warning, request' },
    project: { type: 'string' as const, description: 'Filter by project name' },
    tag: { type: 'string' as const, description: 'Filter by tag (e.g., port:5173)' },
    limit: { type: 'string' as const, description: 'Max messages to return (default: 50)' },
    json: { type: 'boolean' as const, description: 'Output as JSON' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    const messages = readBoard({
      since: args.since as string | undefined,
      type: args.type as MessageType | undefined,
      project: args.project as string | undefined,
      tag: args.tag as string | undefined,
      limit: args.limit ? parseInt(args.limit as string, 10) : undefined,
    })

    if (isJsonOutput()) {
      output(messages)
    } else {
      if (messages.length === 0) {
        prettyLog('info', 'No messages on the board')
      } else {
        for (const msg of messages) {
          formatMessage(msg)
        }
      }
    }
  },
})

const postCommand = defineCommand({
  meta: { name: 'post', description: 'Post a message to the coordination board' },
  args: {
    body: { type: 'positional' as const, description: 'Message body', required: true },
    type: { type: 'string' as const, description: 'Message type: claim, release, info, warning, request. Default: info' },
    tag: { type: 'string' as const, description: 'Add a tag (repeatable with comma separation, e.g., port:5173,dev-server)' },
    ttl: { type: 'string' as const, description: 'TTL in seconds (overrides default for type)' },
    json: { type: 'boolean' as const, description: 'Output as JSON' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    const tags = args.tag ? (args.tag as string).split(',').map(t => t.trim()).filter(Boolean) : undefined
    const message = await postMessage({
      body: args.body as string,
      type: (args.type as MessageType) ?? 'info',
      tags,
      ttl: args.ttl ? parseInt(args.ttl as string, 10) : undefined,
    })

    if (isJsonOutput()) {
      output(message)
    } else {
      prettyLog('success', `Posted: ${message.body}`)
    }
  },
})

const checkCommand = defineCommand({
  meta: { name: 'check', description: 'Check if a resource is claimed by another agent' },
  args: {
    resource: { type: 'positional' as const, description: 'Resource tag to check (e.g., port:5173)', required: true },
    json: { type: 'boolean' as const, description: 'Output as JSON' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    const claim = checkResource(args.resource as string)

    if (isJsonOutput()) {
      output(claim ? { claimed: true, claim } : { claimed: false })
    } else {
      if (claim) {
        prettyLog('warning', `Resource "${args.resource}" is claimed`)
        formatMessage(claim)
        process.exit(0)
      } else {
        prettyLog('success', `Resource "${args.resource}" is free`)
        process.exit(1)
      }
    }
  },
})

const releaseAllCommand = defineCommand({
  meta: { name: 'release-all', description: 'Release all claims by the current task' },
  args: {
    json: { type: 'boolean' as const, description: 'Output as JSON' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    const taskId = process.env.FULCRUM_TASK_ID
    if (!taskId) {
      if (isJsonOutput()) {
        output({ released: 0, message: 'No FULCRUM_TASK_ID set' })
      } else {
        prettyLog('info', 'No FULCRUM_TASK_ID set — nothing to release')
      }
      return
    }

    const count = releaseAllByTask(taskId)
    if (isJsonOutput()) {
      output({ released: count, taskId })
    } else {
      if (count > 0) {
        prettyLog('success', `Released ${count} claim(s) for task ${taskId}`)
      } else {
        prettyLog('info', 'No active claims to release')
      }
    }
  },
})

const cleanCommand = defineCommand({
  meta: { name: 'clean', description: 'Remove expired messages from the board' },
  args: {
    all: { type: 'boolean' as const, description: 'Remove ALL messages (not just expired)' },
    json: { type: 'boolean' as const, description: 'Output as JSON' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    const count = cleanBoard(args.all as boolean)

    if (isJsonOutput()) {
      output({ deleted: count })
    } else {
      if (count > 0) {
        prettyLog('success', `Removed ${count} message(s)`)
      } else {
        prettyLog('info', 'Nothing to clean')
      }
    }
  },
})

// ============================================================================
// Main command
// ============================================================================

export const boardCommand = defineCommand({
  meta: { name: 'board', description: 'Agent coordination board for multi-agent environments' },
  subCommands: {
    read: readCommand,
    post: postCommand,
    check: checkCommand,
    'release-all': releaseAllCommand,
    clean: cleanCommand,
  },
})
