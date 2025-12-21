import { ViboraClient } from '../client'
import { output } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import type { TaskStatus } from '@shared/types'

const STATUS_MAP: Record<string, TaskStatus> = {
  done: 'DONE',
  review: 'IN_REVIEW',
  cancel: 'CANCELLED',
  'in-progress': 'IN_PROGRESS',
}

/**
 * Finds the task associated with the current worktree.
 * Matches the current working directory (or --path) against task worktreePaths.
 */
async function findCurrentTask(client: ViboraClient, pathOverride?: string) {
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
    output(task)
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
    output(updatedTask)
    return
  }

  // Handle status change actions
  const newStatus = STATUS_MAP[action]
  if (!newStatus) {
    throw new CliError(
      'INVALID_ACTION',
      `Unknown action: ${action}. Valid actions: done, review, cancel, in-progress, pr`,
      ExitCodes.INVALID_ARGS
    )
  }

  const task = await findCurrentTask(client, pathOverride)
  const updatedTask = await client.moveTask(task.id, newStatus)
  output(updatedTask)
}
