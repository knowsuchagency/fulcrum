import { basename } from 'node:path'
import { ViboraClient } from '../client'
import { output } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import type { TaskStatus } from '@shared/types'

// DONE is intentionally excluded - tasks complete automatically when PRs merge
const VALID_STATUSES: TaskStatus[] = ['IN_PROGRESS', 'IN_REVIEW', 'CANCELED']

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

      output(tasks)
      break
    }

    case 'get': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
      }
      const task = await client.getTask(id)
      output(task)
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

      output(task)
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
      output(task)
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
      output(task)
      break
    }

    case 'delete': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
      }

      const deleteLinkedWorktree = flags['delete-worktree'] === 'true' || flags['delete-worktree'] === ''
      await client.deleteTask(id, deleteLinkedWorktree)
      output({ deleted: id })
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
