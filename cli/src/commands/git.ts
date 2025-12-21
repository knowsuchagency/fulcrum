import { ViboraClient } from '../client'
import { output } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'

export async function handleGitCommand(
  action: string | undefined,
  flags: Record<string, string>
) {
  const client = new ViboraClient(flags.url, flags.port)

  switch (action) {
    case 'status': {
      const path = flags.path || process.cwd()
      const status = await client.getStatus(path)
      output(status)
      break
    }

    case 'diff': {
      const path = flags.path || process.cwd()
      const diff = await client.getDiff(path, {
        staged: flags.staged === 'true',
        ignoreWhitespace: flags['ignore-whitespace'] === 'true',
        includeUntracked: flags['include-untracked'] === 'true',
      })
      output(diff)
      break
    }

    case 'branches': {
      const repo = flags.repo
      if (!repo) {
        throw new CliError('MISSING_REPO', '--repo is required', ExitCodes.INVALID_ARGS)
      }
      const branches = await client.getBranches(repo)
      output(branches)
      break
    }

    default:
      throw new CliError(
        'UNKNOWN_ACTION',
        `Unknown action: ${action}. Valid: status, diff, branches`,
        ExitCodes.INVALID_ARGS
      )
  }
}
