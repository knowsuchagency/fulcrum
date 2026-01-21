import { defineCommand } from 'citty'
import { FulcrumClient } from '../client'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import type { Repository } from '@shared/types'
import { globalArgs, toFlags, setupJsonOutput } from './shared'

const VALID_AGENTS = ['claude', 'opencode'] as const

function formatRepository(repo: Repository): void {
  console.log(`${repo.displayName}`)
  console.log(`  ID:          ${repo.id}`)
  console.log(`  Path:        ${repo.path}`)
  if (repo.remoteUrl) console.log(`  Remote:      ${repo.remoteUrl}`)
  if (repo.defaultAgent) console.log(`  Agent:       ${repo.defaultAgent}`)
  if (repo.startupScript) console.log(`  Startup:     ${repo.startupScript}`)
  if (repo.copyFiles) console.log(`  Copy Files:  ${repo.copyFiles}`)
  if (repo.isCopierTemplate) console.log(`  Template:    yes`)
}

function formatRepositoryList(repos: Repository[]): void {
  if (repos.length === 0) {
    console.log('No repositories found')
    return
  }

  console.log(`\n${repos.length} REPOSITORIES`)
  for (const repo of repos) {
    const agent = repo.defaultAgent ? ` [${repo.defaultAgent}]` : ''
    console.log(`  ${repo.displayName}${agent}`)
    console.log(`    ${repo.id} · ${repo.path}`)
  }
}

export async function handleRepositoriesCommand(
  action: string | undefined,
  positional: string[],
  flags: Record<string, string>
) {
  const client = new FulcrumClient(flags.url, flags.port)

  switch (action) {
    case 'list': {
      const orphans = flags.orphans === 'true' || flags.orphans === ''
      const projectId = flags['project-id']

      const repos = await client.listRepositories({ orphans, projectId })

      if (isJsonOutput()) {
        output(repos)
      } else {
        formatRepositoryList(repos)
      }
      break
    }

    case 'get': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Repository ID required', ExitCodes.INVALID_ARGS)
      }
      const repo = await client.getRepository(id)
      if (isJsonOutput()) {
        output(repo)
      } else {
        formatRepository(repo)
      }
      break
    }

    case 'add': {
      const path = flags.path
      if (!path) {
        throw new CliError('MISSING_PATH', '--path is required', ExitCodes.INVALID_ARGS)
      }

      const repo = await client.addRepository(path, flags['display-name'])
      if (isJsonOutput()) {
        output(repo)
      } else {
        console.log(`Added repository: ${repo.displayName}`)
        console.log(`  ID: ${repo.id}`)
        console.log(`  Path: ${repo.path}`)
      }
      break
    }

    case 'update': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Repository ID required', ExitCodes.INVALID_ARGS)
      }

      const updates: Record<string, unknown> = {}
      if (flags['display-name'] !== undefined) updates.displayName = flags['display-name']
      if (flags['startup-script'] !== undefined) updates.startupScript = flags['startup-script'] || null
      if (flags['copy-files'] !== undefined) updates.copyFiles = flags['copy-files'] || null
      if (flags['default-agent'] !== undefined) {
        const agent = flags['default-agent'].toLowerCase()
        if (agent && !VALID_AGENTS.includes(agent as 'claude' | 'opencode')) {
          throw new CliError(
            'INVALID_AGENT',
            `Invalid agent: ${flags['default-agent']}. Valid: ${VALID_AGENTS.join(', ')}`,
            ExitCodes.INVALID_ARGS
          )
        }
        updates.defaultAgent = agent || null
      }

      if (Object.keys(updates).length === 0) {
        throw new CliError(
          'NO_UPDATES',
          'No updates provided. Use --display-name, --startup-script, --copy-files, or --default-agent',
          ExitCodes.INVALID_ARGS
        )
      }

      const repo = await client.updateRepository(id, updates)
      if (isJsonOutput()) {
        output(repo)
      } else {
        console.log(`Updated repository: ${repo.displayName}`)
      }
      break
    }

    case 'delete': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Repository ID required', ExitCodes.INVALID_ARGS)
      }

      const result = await client.deleteRepository(id)
      if (isJsonOutput()) {
        output({ deleted: id, ...result })
      } else {
        console.log(`Deleted repository: ${id}`)
      }
      break
    }

    case 'link': {
      const [repoId, projectId] = positional
      if (!repoId) {
        throw new CliError('MISSING_REPO_ID', 'Repository ID required', ExitCodes.INVALID_ARGS)
      }
      if (!projectId) {
        throw new CliError('MISSING_PROJECT_ID', 'Project ID required', ExitCodes.INVALID_ARGS)
      }

      const isPrimary = flags['as-primary'] === 'true' || flags['as-primary'] === ''
      const force = flags.force === 'true' || flags.force === ''

      try {
        const result = await client.linkRepositoryToProject(repoId, projectId, { isPrimary, force })
        if (isJsonOutput()) {
          output(result)
        } else {
          console.log(`Linked repository ${repoId} to project ${projectId}`)
          if (result.isPrimary) console.log('  Set as primary repository')
        }
      } catch (err: unknown) {
        // Check for conflict error (repo already linked to another project)
        if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 409) {
          const apiError = err as { message?: string }
          throw new CliError(
            'ALREADY_LINKED',
            apiError.message || 'Repository already linked to another project. Use --force to move it.',
            ExitCodes.CONFLICT
          )
        }
        throw err
      }
      break
    }

    case 'unlink': {
      const [repoId, projectId] = positional
      if (!repoId) {
        throw new CliError('MISSING_REPO_ID', 'Repository ID required', ExitCodes.INVALID_ARGS)
      }
      if (!projectId) {
        throw new CliError('MISSING_PROJECT_ID', 'Project ID required', ExitCodes.INVALID_ARGS)
      }

      const result = await client.unlinkRepositoryFromProject(repoId, projectId)
      if (isJsonOutput()) {
        output(result)
      } else {
        console.log(`Unlinked repository ${repoId} from project ${projectId}`)
      }
      break
    }

    default:
      throw new CliError(
        'UNKNOWN_ACTION',
        `Unknown action: ${action}. Valid: list, get, add, update, delete, link, unlink`,
        ExitCodes.INVALID_ARGS
      )
  }
}

// ============================================================================
// Command Definitions
// ============================================================================

const repositoriesListCommand = defineCommand({
  meta: { name: 'list', description: 'List repositories' },
  args: {
    ...globalArgs,
    orphans: { type: 'boolean' as const, description: 'Show only orphan repos' },
    'project-id': { type: 'string' as const, description: 'Filter by project ID' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleRepositoriesCommand('list', [], toFlags(args))
  },
})

const repositoriesGetCommand = defineCommand({
  meta: { name: 'get', description: 'Get repository details' },
  args: {
    ...globalArgs,
    id: { type: 'positional' as const, description: 'Repository ID', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleRepositoriesCommand('get', [args.id as string], toFlags(args))
  },
})

const repositoriesAddCommand = defineCommand({
  meta: { name: 'add', description: 'Add a repository' },
  args: {
    ...globalArgs,
    path: { type: 'string' as const, description: 'Repository path', required: true },
    'display-name': { type: 'string' as const, description: 'Display name' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleRepositoriesCommand('add', [], toFlags(args))
  },
})

const repositoriesUpdateCommand = defineCommand({
  meta: { name: 'update', description: 'Update repository settings' },
  args: {
    ...globalArgs,
    id: { type: 'positional' as const, description: 'Repository ID', required: true },
    'display-name': { type: 'string' as const, description: 'Display name' },
    'startup-script': { type: 'string' as const, description: 'Startup script' },
    'copy-files': { type: 'string' as const, description: 'Files to copy pattern' },
    'default-agent': { type: 'string' as const, description: 'Default agent (claude/opencode)' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleRepositoriesCommand('update', [args.id as string], toFlags(args))
  },
})

const repositoriesDeleteCommand = defineCommand({
  meta: { name: 'delete', description: 'Delete an orphan repository' },
  args: {
    ...globalArgs,
    id: { type: 'positional' as const, description: 'Repository ID', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleRepositoriesCommand('delete', [args.id as string], toFlags(args))
  },
})

const repositoriesLinkCommand = defineCommand({
  meta: { name: 'link', description: 'Link repository to project' },
  args: {
    ...globalArgs,
    repoId: { type: 'positional' as const, description: 'Repository ID', required: true },
    projectId: { type: 'positional' as const, description: 'Project ID', required: true },
    'as-primary': { type: 'boolean' as const, description: 'Set as primary repository' },
    force: { type: 'boolean' as const, description: 'Force unlink from current project' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleRepositoriesCommand('link', [args.repoId as string, args.projectId as string], toFlags(args))
  },
})

const repositoriesUnlinkCommand = defineCommand({
  meta: { name: 'unlink', description: 'Unlink repository from project' },
  args: {
    ...globalArgs,
    repoId: { type: 'positional' as const, description: 'Repository ID', required: true },
    projectId: { type: 'positional' as const, description: 'Project ID', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleRepositoriesCommand('unlink', [args.repoId as string, args.projectId as string], toFlags(args))
  },
})

export const repositoriesCommand = defineCommand({
  meta: { name: 'repositories', description: 'Manage repositories' },
  subCommands: {
    list: repositoriesListCommand,
    get: repositoriesGetCommand,
    add: repositoriesAddCommand,
    update: repositoriesUpdateCommand,
    delete: repositoriesDeleteCommand,
    link: repositoriesLinkCommand,
    unlink: repositoriesUnlinkCommand,
  },
})
