import { ViboraClient } from '../client'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import type { TaskStatus, Task } from '@shared/types'

const STATUS_MAP: Record<string, TaskStatus> = {
  review: 'IN_REVIEW',
  done: 'DONE',
  cancel: 'CANCELED',
  'in-progress': 'IN_PROGRESS',
}

function formatTask(task: Task): void {
  console.log(`${task.title}`)
  console.log(`  ID:       ${task.id}`)
  console.log(`  Status:   ${task.status}`)
  console.log(`  Repo:     ${task.repoName}`)
  if (task.branch) console.log(`  Branch:   ${task.branch}`)
  if (task.prUrl) console.log(`  PR:       ${task.prUrl}`)
  if (task.linearTicketId) console.log(`  Linear:   ${task.linearTicketId}`)
}

/**
 * Finds the task associated with the current worktree.
 * Matches the current working directory (or --path) against task worktreePaths.
 */
async function findCurrentTask(client: ViboraClient, pathOverride?: string) {
  // Check VIBORA_TASK_ID env var first (injected by terminal session)
  if (process.env.VIBORA_TASK_ID) {
    try {
      const task = await client.getTask(process.env.VIBORA_TASK_ID)
      if (task) return task
    } catch {
      // Ignore error if task lookup fails (e.g. deleted task), fall back to path
    }
  }

  const currentPath = pathOverride || process.cwd()

  const tasks = await client.listTasks()

  // Find task where worktreePath matches current directory
  // We check if currentPath starts with worktreePath to handle subdirectories
  const task = tasks.find((t) => {
    if (!t.worktreePath) return false
    // Exact match or current path is inside the worktree
    return currentPath === t.worktreePath || currentPath.startsWith(t.worktreePath + '/')
  })

  if (!task) {
    throw new CliError(
      'NOT_IN_WORKTREE',
      `No task found for path: ${currentPath}. Are you inside a Vibora task worktree?`,
      ExitCodes.NOT_FOUND
    )
  }

  return task
}

export async function handleCurrentTaskCommand(
  action: string | undefined,
  rest: string[],
  flags: Record<string, string>
) {
  const client = new ViboraClient(flags.url, flags.port)
  const pathOverride = flags.path

  // If no action, just return the current task info
  if (!action) {
    const task = await findCurrentTask(client, pathOverride)
    if (isJsonOutput()) {
      output(task)
    } else {
      formatTask(task)
    }
    return
  }

  // Handle PR association
  if (action === 'pr') {
    const prUrl = rest[0]
    if (!prUrl) {
      throw new CliError(
        'MISSING_PR_URL',
        'Usage: vibora current-task pr <url>',
        ExitCodes.INVALID_ARGS
      )
    }
    const task = await findCurrentTask(client, pathOverride)
    const updatedTask = await client.updateTask(task.id, { prUrl })
    if (isJsonOutput()) {
      output(updatedTask)
    } else {
      console.log(`Linked PR: ${prUrl}`)
    }
    return
  }

  // Handle Linear ticket association
  if (action === 'linear') {
    const input = rest[0]
    if (!input) {
      throw new CliError(
        'MISSING_LINEAR_INPUT',
        'Usage: vibora current-task linear <url-or-ticket>',
        ExitCodes.INVALID_ARGS
      )
    }

    let ticketId: string
    let ticketUrl: string | null = null

    // Check if input is a ticket number (e.g., DAT-547)
    const ticketMatch = input.match(/^([A-Z]+-\d+)$/i)
    if (ticketMatch) {
      ticketId = ticketMatch[1].toUpperCase()
    } else {
      // Try to extract from URL
      const urlMatch = input.match(/\/issue\/([A-Z]+-\d+)/i)
      if (!urlMatch) {
        throw new CliError(
          'INVALID_LINEAR_INPUT',
          'Invalid input. Expected ticket number (DAT-547) or URL (https://linear.app/team/issue/DAT-547)',
          ExitCodes.INVALID_ARGS
        )
      }
      ticketId = urlMatch[1].toUpperCase()
      ticketUrl = input
    }

    const task = await findCurrentTask(client, pathOverride)
    const updatedTask = await client.updateTask(task.id, {
      linearTicketId: ticketId,
      linearTicketUrl: ticketUrl,
    })
    if (isJsonOutput()) {
      output(updatedTask)
    } else {
      console.log(`Linked Linear ticket: ${ticketId}`)
    }
    return
  }

  // Handle status change actions
  const newStatus = STATUS_MAP[action]
  if (!newStatus) {
    throw new CliError(
      'INVALID_ACTION',
      `Unknown action: ${action}. Valid actions: in-progress, review, done, cancel, pr, linear`,
      ExitCodes.INVALID_ARGS
    )
  }

  const task = await findCurrentTask(client, pathOverride)
  const updatedTask = await client.moveTask(task.id, newStatus)
  if (isJsonOutput()) {
    output(updatedTask)
  } else {
    console.log(`Moved task to ${newStatus}: ${updatedTask.title}`)
  }
}
