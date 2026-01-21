import { defineCommand } from 'citty'
import { FulcrumClient } from '../client'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import { globalArgs, toFlags, setupJsonOutput } from './shared'

export async function handleWorktreesCommand(
  action: string | undefined,
  flags: Record<string, string>
) {
  const client = new FulcrumClient(flags.url, flags.port)

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

// ============================================================================
// Command Definitions
// ============================================================================

const worktreesListCommand = defineCommand({
  meta: { name: 'list', description: 'List all worktrees' },
  args: {
    ...globalArgs,
    repo: { type: 'string' as const, description: 'Repository path' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleWorktreesCommand('list', toFlags(args))
  },
})

const worktreesDeleteCommand = defineCommand({
  meta: { name: 'delete', description: 'Delete a worktree' },
  args: {
    ...globalArgs,
    path: { type: 'string' as const, description: 'Worktree path', required: true },
    force: { type: 'boolean' as const, description: 'Force deletion' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleWorktreesCommand('delete', toFlags(args))
  },
})

export const worktreesCommand = defineCommand({
  meta: { name: 'worktrees', description: 'Manage git worktrees' },
  subCommands: {
    list: worktreesListCommand,
    delete: worktreesDeleteCommand,
  },
})
