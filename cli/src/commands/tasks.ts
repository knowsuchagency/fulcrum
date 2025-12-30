import { basename } from 'node:path'
import { ViboraClient } from '../client'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import type { TaskStatus, Task } from '@shared/types'

// DONE is intentionally excluded - tasks complete automatically when PRs merge
const VALID_STATUSES: TaskStatus[] = ['IN_PROGRESS', 'IN_REVIEW', 'CANCELED']

function formatTask(task: Task): void {
  console.log(`${task.title}`)
  console.log(`  ID:       ${task.id}`)
  console.log(`  Status:   ${task.status}`)
  console.log(`  Repo:     ${task.repoName}`)
  if (task.branch) console.log(`  Branch:   ${task.branch}`)
  if (task.prUrl) console.log(`  PR:       ${task.prUrl}`)
  if (task.linearTicketId) console.log(`  Linear:   ${task.linearTicketId}`)
}

function formatTaskList(tasks: Task[]): void {
  if (tasks.length === 0) {
    console.log('No tasks found')
    return
  }

  // Group by status
  const byStatus = {
    IN_PROGRESS: tasks.filter((t) => t.status === 'IN_PROGRESS'),
    IN_REVIEW: tasks.filter((t) => t.status === 'IN_REVIEW'),
    DONE: tasks.filter((t) => t.status === 'DONE'),
    CANCELED: tasks.filter((t) => t.status === 'CANCELED'),
  }

  for (const [status, statusTasks] of Object.entries(byStatus)) {
    if (statusTasks.length === 0) continue
    console.log(`\n${status} (${statusTasks.length})`)
    for (const task of statusTasks) {
      const branch = task.branch ? ` [${task.branch}]` : ''
      console.log(`  ${task.title}${branch}`)
      console.log(`    ${task.id} · ${task.repoName}`)
    }
  }
}

export async function handleTasksCommand(
  action: string | undefined,
  positional: string[],
  flags: Record<string, string>
) {
  const client = new ViboraClient(flags.url, flags.port)

  switch (action) {
    case 'list': {
      let tasks = await client.listTasks()

      // Apply filters
      if (flags.status) {
        const status = flags.status.toUpperCase() as TaskStatus
        if (!VALID_STATUSES.includes(status)) {
          throw new CliError(
            'INVALID_STATUS',
            `Invalid status: ${flags.status}. Valid: ${VALID_STATUSES.join(', ')}`,
            ExitCodes.INVALID_ARGS
          )
        }
        tasks = tasks.filter((t) => t.status === status)
      }

      if (flags.repo) {
        const repoFilter = flags.repo.toLowerCase()
        tasks = tasks.filter(
          (t) =>
            t.repoName.toLowerCase().includes(repoFilter) ||
            t.repoPath.toLowerCase().includes(repoFilter)
        )
      }

      if (isJsonOutput()) {
        output(tasks)
      } else {
        formatTaskList(tasks)
      }
      break
    }

    case 'get': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
      }
      const task = await client.getTask(id)
      if (isJsonOutput()) {
        output(task)
      } else {
        formatTask(task)
      }
      break
    }

    case 'create': {
      const title = flags.title
      const repoPath = flags.repo || flags['repo-path']
      const baseBranch = flags['base-branch'] || 'main'
      const branch = flags.branch
      const description = flags.description || ''

      if (!title) {
        throw new CliError('MISSING_TITLE', '--title is required', ExitCodes.INVALID_ARGS)
      }
      if (!repoPath) {
        throw new CliError('MISSING_REPO', '--repo is required', ExitCodes.INVALID_ARGS)
      }

      const repoName = flags['repo-name'] || basename(repoPath)

      const task = await client.createTask({
        title,
        description,
        repoPath,
        repoName,
        baseBranch,
        branch: branch || null,
        worktreePath: flags['worktree-path'] || null,
        status: 'IN_PROGRESS',
      })

      if (isJsonOutput()) {
        output(task)
      } else {
        console.log(`Created task: ${task.title}`)
        console.log(`  ID: ${task.id}`)
        if (task.worktreePath) console.log(`  Worktree: ${task.worktreePath}`)
      }
      break
    }

    case 'update': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
      }

      const updates: Record<string, unknown> = {}
      if (flags.title !== undefined) updates.title = flags.title
      if (flags.description !== undefined) updates.description = flags.description

      if (Object.keys(updates).length === 0) {
        throw new CliError(
          'NO_UPDATES',
          'No updates provided. Use --title or --description',
          ExitCodes.INVALID_ARGS
        )
      }

      const task = await client.updateTask(id, updates)
      if (isJsonOutput()) {
        output(task)
      } else {
        console.log(`Updated task: ${task.title}`)
      }
      break
    }

    case 'move': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
      }

      const status = (flags.status?.toUpperCase() || '') as TaskStatus
      if (!status || !VALID_STATUSES.includes(status)) {
        throw new CliError(
          'INVALID_STATUS',
          `--status is required. Valid: ${VALID_STATUSES.join(', ')}`,
          ExitCodes.INVALID_ARGS
        )
      }

      const position = flags.position ? parseInt(flags.position, 10) : undefined
      const task = await client.moveTask(id, status, position)
      if (isJsonOutput()) {
        output(task)
      } else {
        console.log(`Moved task to ${status}: ${task.title}`)
      }
      break
    }

    case 'delete': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
      }

      const deleteLinkedWorktree = flags['delete-worktree'] === 'true' || flags['delete-worktree'] === ''
      await client.deleteTask(id, deleteLinkedWorktree)
      if (isJsonOutput()) {
        output({ deleted: id })
      } else {
        console.log(`Deleted task: ${id}`)
      }
      break
    }

    default:
      throw new CliError(
        'UNKNOWN_ACTION',
        `Unknown action: ${action}. Valid: list, get, create, update, move, delete`,
        ExitCodes.INVALID_ARGS
      )
  }
}
