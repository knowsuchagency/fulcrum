import { ViboraClient } from '../client'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import type { FileTreeEntry } from '@shared/types'

function formatDirectoryEntry(entry: { name: string; type: string; isGitRepo?: boolean }): string {
  const icon = entry.type === 'directory' ? (entry.isGitRepo ? '📁' : '📂') : '📄'
  const gitIndicator = entry.isGitRepo ? ' [git]' : ''
  return `${icon} ${entry.name}${gitIndicator}`
}

function formatTree(entries: FileTreeEntry[], indent: string = ''): void {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const isLast = i === entries.length - 1
    const prefix = isLast ? '└── ' : '├── '
    const childIndent = indent + (isLast ? '    ' : '│   ')

    const icon = entry.type === 'directory' ? '📁' : '📄'
    console.log(`${indent}${prefix}${icon} ${entry.name}`)

    if (entry.children && entry.children.length > 0) {
      formatTree(entry.children, childIndent)
    }
  }
}

export async function handleFsCommand(
  action: string | undefined,
  positional: string[],
  flags: Record<string, string>
) {
  const client = new ViboraClient(flags.url, flags.port)

  switch (action) {
    case 'list': {
      const path = flags.path || positional[0]
      const result = await client.listDirectory(path)
      if (isJsonOutput()) {
        output(result)
      } else {
        console.log(`Directory: ${result.path}`)
        console.log(`Parent:    ${result.parent}`)
        console.log('')
        if (result.entries.length === 0) {
          console.log('(empty directory)')
        } else {
          for (const entry of result.entries) {
            console.log(formatDirectoryEntry(entry))
          }
        }
      }
      break
    }

    case 'tree': {
      const root = flags.root || positional[0]
      if (!root) {
        throw new CliError('MISSING_ROOT', '--root is required', ExitCodes.INVALID_ARGS)
      }

      const result = await client.getFileTree(root)
      if (isJsonOutput()) {
        output(result)
      } else {
        console.log(`📁 ${result.root}`)
        formatTree(result.entries)
      }
      break
    }

    case 'read': {
      const path = flags.path || positional[0]
      const root = flags.root

      if (!path) {
        throw new CliError('MISSING_PATH', '--path is required', ExitCodes.INVALID_ARGS)
      }
      if (!root) {
        throw new CliError('MISSING_ROOT', '--root is required', ExitCodes.INVALID_ARGS)
      }

      const maxLines = flags['max-lines'] ? parseInt(flags['max-lines'], 10) : undefined
      const result = await client.readFile(path, root, maxLines)

      if (isJsonOutput()) {
        output(result)
      } else {
        if (result.truncated) {
          console.log(`[Showing ${flags['max-lines'] || 5000} of ${result.lineCount} lines]\n`)
        }
        console.log(result.content)
        console.log('')
        console.log(`--- ${result.mimeType} · ${result.size} bytes · ${result.lineCount} lines ---`)
      }
      break
    }

    case 'write': {
      const path = flags.path || positional[0]
      const root = flags.root
      const content = flags.content

      if (!path) {
        throw new CliError('MISSING_PATH', '--path is required', ExitCodes.INVALID_ARGS)
      }
      if (!root) {
        throw new CliError('MISSING_ROOT', '--root is required', ExitCodes.INVALID_ARGS)
      }
      if (content === undefined) {
        throw new CliError('MISSING_CONTENT', '--content is required', ExitCodes.INVALID_ARGS)
      }

      const result = await client.writeFile({ path, root, content })
      if (isJsonOutput()) {
        output(result)
      } else {
        console.log(`Written: ${path}`)
        console.log(`  Size: ${result.size} bytes`)
        console.log(`  Modified: ${result.mtime}`)
      }
      break
    }

    case 'stat': {
      const path = flags.path || positional[0]
      if (!path) {
        throw new CliError('MISSING_PATH', '--path is required', ExitCodes.INVALID_ARGS)
      }

      const result = await client.getPathStat(path)
      if (isJsonOutput()) {
        output(result)
      } else {
        console.log(`Path:      ${result.path}`)
        console.log(`Exists:    ${result.exists}`)
        console.log(`Type:      ${result.type || 'N/A'}`)
      }
      break
    }

    case 'is-git-repo': {
      const path = flags.path || positional[0]
      if (!path) {
        throw new CliError('MISSING_PATH', '--path is required', ExitCodes.INVALID_ARGS)
      }

      const result = await client.isGitRepo(path)
      if (isJsonOutput()) {
        output(result)
      } else {
        console.log(`Path:        ${result.path}`)
        console.log(`Git repo:    ${result.isGitRepo ? 'yes' : 'no'}`)
      }
      break
    }

    case 'edit': {
      const path = flags.path || positional[0]
      const root = flags.root
      const old_string = flags['old-string']
      const new_string = flags['new-string']

      if (!path) {
        throw new CliError('MISSING_PATH', '--path is required', ExitCodes.INVALID_ARGS)
      }
      if (!root) {
        throw new CliError('MISSING_ROOT', '--root is required', ExitCodes.INVALID_ARGS)
      }
      if (old_string === undefined) {
        throw new CliError('MISSING_OLD_STRING', '--old-string is required', ExitCodes.INVALID_ARGS)
      }
      if (new_string === undefined) {
        throw new CliError('MISSING_NEW_STRING', '--new-string is required', ExitCodes.INVALID_ARGS)
      }

      const result = await client.editFile({ path, root, old_string, new_string })
      if (isJsonOutput()) {
        output(result)
      } else {
        console.log(`Edited: ${path}`)
        console.log(`  Size: ${result.size} bytes`)
        console.log(`  Modified: ${result.mtime}`)
      }
      break
    }

    default:
      throw new CliError(
        'UNKNOWN_ACTION',
        `Unknown action: ${action}. Valid: list, tree, read, write, edit, stat, is-git-repo`,
        ExitCodes.INVALID_ARGS
      )
  }
}
