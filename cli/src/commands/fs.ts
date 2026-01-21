import { defineCommand } from 'citty'
import { FulcrumClient } from '../client'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import type { FileTreeEntry } from '@shared/types'
import { globalArgs, toFlags, setupJsonOutput } from './shared'

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
  const client = new FulcrumClient(flags.url, flags.port)

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

// ============================================================================
// Command Definitions
// ============================================================================

const fsListCommand = defineCommand({
  meta: { name: 'list', description: 'List directory contents' },
  args: {
    ...globalArgs,
    path: { type: 'positional' as const, description: 'Directory path' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleFsCommand('list', args.path ? [args.path as string] : [], toFlags(args))
  },
})

const fsTreeCommand = defineCommand({
  meta: { name: 'tree', description: 'Get file tree' },
  args: {
    ...globalArgs,
    root: { type: 'positional' as const, description: 'Root directory path', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleFsCommand('tree', args.root ? [args.root as string] : [], toFlags(args))
  },
})

const fsReadCommand = defineCommand({
  meta: { name: 'read', description: 'Read file contents' },
  args: {
    ...globalArgs,
    path: { type: 'string' as const, description: 'File path', required: true },
    root: { type: 'string' as const, description: 'Root directory', required: true },
    'max-lines': { type: 'string' as const, description: 'Maximum lines to read' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleFsCommand('read', [], toFlags(args))
  },
})

const fsWriteCommand = defineCommand({
  meta: { name: 'write', description: 'Write file contents' },
  args: {
    ...globalArgs,
    path: { type: 'string' as const, description: 'File path', required: true },
    root: { type: 'string' as const, description: 'Root directory', required: true },
    content: { type: 'string' as const, description: 'Content to write', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleFsCommand('write', [], toFlags(args))
  },
})

const fsEditCommand = defineCommand({
  meta: { name: 'edit', description: 'Edit file by string replacement' },
  args: {
    ...globalArgs,
    path: { type: 'string' as const, description: 'File path', required: true },
    root: { type: 'string' as const, description: 'Root directory', required: true },
    'old-string': { type: 'string' as const, description: 'String to replace', required: true },
    'new-string': { type: 'string' as const, description: 'Replacement string', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleFsCommand('edit', [], toFlags(args))
  },
})

const fsStatCommand = defineCommand({
  meta: { name: 'stat', description: 'Get file/directory metadata' },
  args: {
    ...globalArgs,
    path: { type: 'positional' as const, description: 'Path to check', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleFsCommand('stat', args.path ? [args.path as string] : [], toFlags(args))
  },
})

const fsIsGitRepoCommand = defineCommand({
  meta: { name: 'is-git-repo', description: 'Check if path is a git repo' },
  args: {
    ...globalArgs,
    path: { type: 'positional' as const, description: 'Path to check', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleFsCommand('is-git-repo', args.path ? [args.path as string] : [], toFlags(args))
  },
})

export const fsCommand = defineCommand({
  meta: { name: 'fs', description: 'Filesystem operations' },
  subCommands: {
    list: fsListCommand,
    tree: fsTreeCommand,
    read: fsReadCommand,
    write: fsWriteCommand,
    edit: fsEditCommand,
    stat: fsStatCommand,
    'is-git-repo': fsIsGitRepoCommand,
  },
})
