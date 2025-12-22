import { ViboraClient } from '../client'
import { output } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'

export async function handleWorktreesCommand(
  action: string | undefined,
  flags: Record<string, string>
) {
  const client = new ViboraClient(flags.url, flags.port)

  switch (action) {
    case 'list': {
      const worktrees = await client.listWorktrees()
      output(worktrees)
      break
    }

    case 'delete': {
      const worktreePath = flags.path
      if (!worktreePath) {
        throw new CliError('MISSING_PATH', '--path is required', ExitCodes.INVALID_ARGS)
      }
      const deleteLinkedTask = flags['delete-task'] === 'true' || flags['delete-task'] === ''
      const result = await client.deleteWorktree(worktreePath, flags.repo, deleteLinkedTask)
      output(result)
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
