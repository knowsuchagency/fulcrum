import { FulcrumClient } from '../client'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'

export async function handleGitCommand(
  action: string | undefined,
  flags: Record<string, string>
) {
  const client = new FulcrumClient(flags.url, flags.port)

  switch (action) {
    case 'status': {
      const path = flags.path || process.cwd()
      const status = await client.getStatus(path)
      if (isJsonOutput()) {
        output(status)
      } else {
        console.log(`Branch: ${status.branch}`)
        if (status.ahead) console.log(`  Ahead: ${status.ahead}`)
        if (status.behind) console.log(`  Behind: ${status.behind}`)
        if (status.staged?.length) console.log(`  Staged: ${status.staged.length} files`)
        if (status.modified?.length) console.log(`  Modified: ${status.modified.length} files`)
        if (status.untracked?.length) console.log(`  Untracked: ${status.untracked.length} files`)
        if (!status.staged?.length && !status.modified?.length && !status.untracked?.length) {
          console.log('  Working tree clean')
        }
      }
      break
    }

    case 'diff': {
      const path = flags.path || process.cwd()
      const diff = await client.getDiff(path, {
        staged: flags.staged === 'true',
        ignoreWhitespace: flags['ignore-whitespace'] === 'true',
        includeUntracked: flags['include-untracked'] === 'true',
      })
      if (isJsonOutput()) {
        output(diff)
      } else {
        // For diff, just output the raw diff text
        console.log(diff.diff || 'No changes')
      }
      break
    }

    case 'branches': {
      const repo = flags.repo
      if (!repo) {
        throw new CliError('MISSING_REPO', '--repo is required', ExitCodes.INVALID_ARGS)
      }
      const branches = await client.getBranches(repo)
      if (isJsonOutput()) {
        output(branches)
      } else {
        for (const branch of branches) {
          const current = branch.current ? '* ' : '  '
          console.log(`${current}${branch.name}`)
        }
      }
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
