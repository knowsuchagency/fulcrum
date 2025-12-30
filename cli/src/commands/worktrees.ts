import { ViboraClient } from '../client'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'

export async function handleWorktreesCommand(
  action: string | undefined,
  flags: Record<string, string>
) {
  const client = new ViboraClient(flags.url, flags.port)

  switch (action) {
    case 'list': {
      const worktrees = await client.listWorktrees()
      if (isJsonOutput()) {
        output(worktrees)
      } else {
        if (worktrees.length === 0) {
          console.log('No worktrees found')
        } else {
          for (const wt of worktrees) {
            console.log(`${wt.path}`)
            console.log(`  Branch: ${wt.branch}`)
            if (wt.taskId) console.log(`  Task: ${wt.taskId}`)
          }
        }
      }
      break
    }

    case 'delete': {
      const worktreePath = flags.path
      if (!worktreePath) {
        throw new CliError('MISSING_PATH', '--path is required', ExitCodes.INVALID_ARGS)
      }
      const deleteLinkedTask = flags['delete-task'] === 'true' || flags['delete-task'] === ''
      const result = await client.deleteWorktree(worktreePath, flags.repo, deleteLinkedTask)
      if (isJsonOutput()) {
        output(result)
      } else {
        console.log(`Deleted worktree: ${worktreePath}`)
      }
      break
    }

    default:
      throw new CliError(
        'UNKNOWN_ACTION',
        `Unknown action: ${action}. Valid: list, delete`,
        ExitCodes.INVALID_ARGS
      )
  }
}
