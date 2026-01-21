import { defineCommand } from 'citty'
import { FulcrumClient } from '../client'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import type { ProjectWithDetails } from '@shared/types'
import { globalArgs, toFlags, setupJsonOutput } from './shared'

const VALID_STATUSES = ['active', 'archived'] as const

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatProject(project: ProjectWithDetails): void {
  console.log(`${project.name}`)
  console.log(`  ID:          ${project.id}`)
  console.log(`  Status:      ${project.status}`)
  if (project.description) console.log(`  Description: ${project.description}`)
  if (project.notes) console.log(`  Notes:       ${project.notes}`)
  if (project.tags && project.tags.length > 0) {
    console.log(`  Tags:        ${project.tags.map((t) => t.name).join(', ')}`)
  }
  if (project.repository) {
    console.log(`  Repository:  ${project.repository.path}`)
    if (project.repository.remoteUrl) {
      console.log(`  Remote:      ${project.repository.remoteUrl}`)
    }
  }
  if (project.app) {
    console.log(`  App:         ${project.app.name} (${project.app.status})`)
  }
  if (project.terminalTab) {
    console.log(`  Terminal:    ${project.terminalTab.name}`)
  }
  if (project.attachments && project.attachments.length > 0) {
    console.log(`  Attachments:`)
    for (const att of project.attachments) {
      console.log(`    - ${att.filename} (${formatFileSize(att.size)})`)
      console.log(`      ID: ${att.id}`)
    }
  }
}

function formatProjectList(projects: ProjectWithDetails[]): void {
  if (projects.length === 0) {
    console.log('No projects found')
    return
  }

  // Group by status
  const byStatus = {
    active: projects.filter((p) => p.status === 'active'),
    archived: projects.filter((p) => p.status === 'archived'),
  }

  for (const [status, statusProjects] of Object.entries(byStatus)) {
    if (statusProjects.length === 0) continue
    console.log(`\n${status.toUpperCase()} (${statusProjects.length})`)
    for (const project of statusProjects) {
      const repoPath = project.repository?.path || 'no repository'
      const appStatus = project.app ? ` [${project.app.status}]` : ''
      console.log(`  ${project.name}${appStatus}`)
      console.log(`    ${project.id} · ${repoPath}`)
    }
  }
}

export async function handleProjectsCommand(
  action: string | undefined,
  positional: string[],
  flags: Record<string, string>
) {
  const client = new FulcrumClient(flags.url, flags.port)

  switch (action) {
    case 'list': {
      // Validate status filter before making network call
      let statusFilter: 'active' | 'archived' | undefined
      if (flags.status) {
        const status = flags.status.toLowerCase() as 'active' | 'archived'
        if (!VALID_STATUSES.includes(status)) {
          throw new CliError(
            'INVALID_STATUS',
            `Invalid status: ${flags.status}. Valid: ${VALID_STATUSES.join(', ')}`,
            ExitCodes.INVALID_ARGS
          )
        }
        statusFilter = status
      }

      let projects = await client.listProjects()

      // Apply filters
      if (statusFilter) {
        projects = projects.filter((p) => p.status === statusFilter)
      }

      if (isJsonOutput()) {
        output(projects)
      } else {
        formatProjectList(projects)
      }
      break
    }

    case 'get': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Project ID required', ExitCodes.INVALID_ARGS)
      }
      const project = await client.getProject(id)
      if (isJsonOutput()) {
        output(project)
      } else {
        formatProject(project)
      }
      break
    }

    case 'create': {
      const name = flags.name
      if (!name) {
        throw new CliError('MISSING_NAME', '--name is required', ExitCodes.INVALID_ARGS)
      }

      // Must provide exactly one of: repository-id, path, or url
      const options = [flags['repository-id'], flags.path, flags.url].filter(Boolean)
      if (options.length === 0) {
        throw new CliError(
          'MISSING_SOURCE',
          'Must provide --repository-id, --path, or --url',
          ExitCodes.INVALID_ARGS
        )
      }
      if (options.length > 1) {
        throw new CliError(
          'CONFLICTING_OPTIONS',
          'Provide only one of: --repository-id, --path, or --url',
          ExitCodes.INVALID_ARGS
        )
      }

      const project = await client.createProject({
        name,
        description: flags.description,
        repositoryId: flags['repository-id'],
        path: flags.path,
        url: flags.url,
        targetDir: flags['target-dir'],
        folderName: flags['folder-name'],
      })

      if (isJsonOutput()) {
        output(project)
      } else {
        console.log(`Created project: ${project.name}`)
        console.log(`  ID: ${project.id}`)
        if (project.repository) {
          console.log(`  Path: ${project.repository.path}`)
        }
      }
      break
    }

    case 'update': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Project ID required', ExitCodes.INVALID_ARGS)
      }

      const updates: Record<string, unknown> = {}
      if (flags.name !== undefined) updates.name = flags.name
      if (flags.description !== undefined) updates.description = flags.description
      if (flags.notes !== undefined) updates.notes = flags.notes || null
      if (flags.status !== undefined) {
        const status = flags.status.toLowerCase()
        if (!VALID_STATUSES.includes(status as 'active' | 'archived')) {
          throw new CliError(
            'INVALID_STATUS',
            `Invalid status: ${flags.status}. Valid: ${VALID_STATUSES.join(', ')}`,
            ExitCodes.INVALID_ARGS
          )
        }
        updates.status = status
      }

      if (Object.keys(updates).length === 0) {
        throw new CliError(
          'NO_UPDATES',
          'No updates provided. Use --name, --description, --notes, or --status',
          ExitCodes.INVALID_ARGS
        )
      }

      const project = await client.updateProject(id, updates)
      if (isJsonOutput()) {
        output(project)
      } else {
        console.log(`Updated project: ${project.name}`)
      }
      break
    }

    case 'delete': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Project ID required', ExitCodes.INVALID_ARGS)
      }

      const deleteDirectory = flags['delete-directory'] === 'true' || flags['delete-directory'] === ''
      const deleteApp = flags['delete-app'] === 'true' || flags['delete-app'] === ''

      const result = await client.deleteProject(id, { deleteDirectory, deleteApp })
      if (isJsonOutput()) {
        output({ deleted: id, ...result })
      } else {
        console.log(`Deleted project: ${id}`)
        if (result.deletedDirectory) console.log('  Directory deleted')
        if (result.deletedApp) console.log('  App deleted')
      }
      break
    }

    case 'scan': {
      const directory = flags.directory || flags.path
      const result = await client.scanProjects(directory)
      if (isJsonOutput()) {
        output(result)
      } else {
        console.log(`Scanned: ${result.directory}`)
        console.log(`Found ${result.repositories.length} git repositories:`)
        for (const repo of result.repositories) {
          const status = repo.hasProject ? '[project]' : repo.hasRepository ? '[repo]' : '[new]'
          console.log(`  ${status} ${repo.name}`)
          console.log(`    ${repo.path}`)
        }
      }
      break
    }

    // Tag commands
    case 'tags': {
      const [subAction, projectId, tagArg] = positional
      if (!subAction) {
        throw new CliError(
          'MISSING_SUBACTION',
          'Subaction required: add, remove',
          ExitCodes.INVALID_ARGS
        )
      }
      if (!projectId) {
        throw new CliError('MISSING_ID', 'Project ID required', ExitCodes.INVALID_ARGS)
      }

      switch (subAction) {
        case 'add': {
          if (!tagArg) {
            throw new CliError('MISSING_TAG', 'Tag name required', ExitCodes.INVALID_ARGS)
          }
          const tag = await client.addProjectTag(projectId, tagArg)
          if (isJsonOutput()) {
            output(tag)
          } else {
            console.log(`Added tag "${tag.name}" to project`)
          }
          break
        }
        case 'remove': {
          if (!tagArg) {
            throw new CliError('MISSING_TAG', 'Tag ID required', ExitCodes.INVALID_ARGS)
          }
          await client.removeProjectTag(projectId, tagArg)
          if (isJsonOutput()) {
            output({ success: true })
          } else {
            console.log(`Removed tag from project`)
          }
          break
        }
        default:
          throw new CliError(
            'UNKNOWN_SUBACTION',
            `Unknown subaction: ${subAction}. Valid: add, remove`,
            ExitCodes.INVALID_ARGS
          )
      }
      break
    }

    // Attachment commands
    case 'attachments': {
      const [subAction, projectId, fileOrId] = positional
      if (!subAction) {
        throw new CliError(
          'MISSING_SUBACTION',
          'Subaction required: list, upload, download, delete',
          ExitCodes.INVALID_ARGS
        )
      }
      if (!projectId) {
        throw new CliError('MISSING_ID', 'Project ID required', ExitCodes.INVALID_ARGS)
      }

      switch (subAction) {
        case 'list': {
          const attachments = await client.listProjectAttachments(projectId)
          if (isJsonOutput()) {
            output(attachments)
          } else if (attachments.length === 0) {
            console.log('No attachments')
          } else {
            for (const att of attachments) {
              console.log(`${att.filename} (${formatFileSize(att.size)})`)
              console.log(`  ID: ${att.id}`)
              console.log(`  Type: ${att.mimeType}`)
            }
          }
          break
        }
        case 'upload': {
          if (!fileOrId) {
            throw new CliError('MISSING_FILE', 'File path required', ExitCodes.INVALID_ARGS)
          }
          const attachment = await client.uploadProjectAttachment(projectId, fileOrId)
          if (isJsonOutput()) {
            output(attachment)
          } else {
            console.log(`Uploaded: ${attachment.filename}`)
            console.log(`  ID: ${attachment.id}`)
          }
          break
        }
        case 'download': {
          if (!fileOrId) {
            throw new CliError('MISSING_ID', 'Attachment ID required', ExitCodes.INVALID_ARGS)
          }
          const info = await client.getProjectAttachmentPath(projectId, fileOrId)
          if (isJsonOutput()) {
            output(info)
          } else {
            console.log(`File: ${info.filename}`)
            console.log(`Path: ${info.path}`)
          }
          break
        }
        case 'delete': {
          if (!fileOrId) {
            throw new CliError('MISSING_ID', 'Attachment ID required', ExitCodes.INVALID_ARGS)
          }
          await client.deleteProjectAttachment(projectId, fileOrId)
          if (isJsonOutput()) {
            output({ success: true })
          } else {
            console.log(`Deleted attachment: ${fileOrId}`)
          }
          break
        }
        default:
          throw new CliError(
            'UNKNOWN_SUBACTION',
            `Unknown subaction: ${subAction}. Valid: list, upload, download, delete`,
            ExitCodes.INVALID_ARGS
          )
      }
      break
    }

    // Link commands
    case 'links': {
      const [subAction, projectId, urlOrId] = positional
      if (!subAction) {
        throw new CliError(
          'MISSING_SUBACTION',
          'Subaction required: list, add, remove',
          ExitCodes.INVALID_ARGS
        )
      }
      if (!projectId) {
        throw new CliError('MISSING_ID', 'Project ID required', ExitCodes.INVALID_ARGS)
      }

      switch (subAction) {
        case 'list': {
          const links = await client.listProjectLinks(projectId)
          if (isJsonOutput()) {
            output(links)
          } else if (links.length === 0) {
            console.log('No links')
          } else {
            for (const link of links) {
              console.log(`${link.label || link.url}`)
              console.log(`  ID: ${link.id}`)
              console.log(`  URL: ${link.url}`)
              if (link.type) console.log(`  Type: ${link.type}`)
            }
          }
          break
        }
        case 'add': {
          if (!urlOrId) {
            throw new CliError('MISSING_URL', 'URL required', ExitCodes.INVALID_ARGS)
          }
          const link = await client.addProjectLink(projectId, urlOrId, flags.label)
          if (isJsonOutput()) {
            output(link)
          } else {
            console.log(`Added link: ${link.label || link.url}`)
            console.log(`  ID: ${link.id}`)
          }
          break
        }
        case 'remove': {
          if (!urlOrId) {
            throw new CliError('MISSING_ID', 'Link ID required', ExitCodes.INVALID_ARGS)
          }
          await client.removeProjectLink(projectId, urlOrId)
          if (isJsonOutput()) {
            output({ success: true })
          } else {
            console.log(`Removed link: ${urlOrId}`)
          }
          break
        }
        default:
          throw new CliError(
            'UNKNOWN_SUBACTION',
            `Unknown subaction: ${subAction}. Valid: list, add, remove`,
            ExitCodes.INVALID_ARGS
          )
      }
      break
    }

    default:
      throw new CliError(
        'UNKNOWN_ACTION',
        `Unknown action: ${action}. Valid: list, get, create, update, delete, scan, tags, attachments, links`,
        ExitCodes.INVALID_ARGS
      )
  }
}

// ============================================================================
// Command Definitions
// ============================================================================

const projectsListCommand = defineCommand({
  meta: { name: 'list', description: 'List projects' },
  args: {
    ...globalArgs,
    status: { type: 'string' as const, description: 'Filter by status (active/archived)' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleProjectsCommand('list', [], toFlags(args))
  },
})

const projectsGetCommand = defineCommand({
  meta: { name: 'get', description: 'Get project details' },
  args: {
    ...globalArgs,
    id: { type: 'positional' as const, description: 'Project ID', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleProjectsCommand('get', [args.id as string], toFlags(args))
  },
})

const projectsCreateCommand = defineCommand({
  meta: { name: 'create', description: 'Create a project' },
  args: {
    ...globalArgs,
    name: { type: 'string' as const, description: 'Project name', required: true },
    description: { type: 'string' as const, description: 'Project description' },
    'repository-id': { type: 'string' as const, description: 'Use existing repository' },
    path: { type: 'string' as const, description: 'Local path to repository' },
    url: { type: 'string' as const, description: 'Git URL to clone' },
    'target-dir': { type: 'string' as const, description: 'Clone target directory' },
    'folder-name': { type: 'string' as const, description: 'Clone folder name' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleProjectsCommand('create', [], toFlags(args))
  },
})

const projectsUpdateCommand = defineCommand({
  meta: { name: 'update', description: 'Update project metadata' },
  args: {
    ...globalArgs,
    id: { type: 'positional' as const, description: 'Project ID', required: true },
    name: { type: 'string' as const, description: 'New name' },
    description: { type: 'string' as const, description: 'New description' },
    notes: { type: 'string' as const, description: 'New notes' },
    status: { type: 'string' as const, description: 'New status (active/archived)' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleProjectsCommand('update', [args.id as string], toFlags(args))
  },
})

const projectsDeleteCommand = defineCommand({
  meta: { name: 'delete', description: 'Delete a project' },
  args: {
    ...globalArgs,
    id: { type: 'positional' as const, description: 'Project ID', required: true },
    'delete-directory': { type: 'boolean' as const, description: 'Also delete the directory' },
    'delete-app': { type: 'boolean' as const, description: 'Also delete the app' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleProjectsCommand('delete', [args.id as string], toFlags(args))
  },
})

const projectsScanCommand = defineCommand({
  meta: { name: 'scan', description: 'Scan directory for git repos' },
  args: {
    ...globalArgs,
    directory: { type: 'string' as const, alias: 'path', description: 'Directory to scan' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleProjectsCommand('scan', [], toFlags(args))
  },
})

const projectsTagsCommand = defineCommand({
  meta: { name: 'tags', description: 'Manage project tags' },
  args: {
    ...globalArgs,
    action: { type: 'positional' as const, description: 'Action: add, remove' },
    projectId: { type: 'positional' as const, description: 'Project ID' },
    tag: { type: 'positional' as const, description: 'Tag name or ID' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    const positional = [args.action as string, args.projectId as string, args.tag as string].filter(Boolean)
    await handleProjectsCommand('tags', positional, toFlags(args))
  },
})

const projectsAttachmentsCommand = defineCommand({
  meta: { name: 'attachments', description: 'Manage project attachments' },
  args: {
    ...globalArgs,
    action: { type: 'positional' as const, description: 'Action: list, upload, download, delete' },
    projectId: { type: 'positional' as const, description: 'Project ID' },
    fileOrId: { type: 'positional' as const, description: 'File path or attachment ID' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    const positional = [args.action as string, args.projectId as string, args.fileOrId as string].filter(Boolean)
    await handleProjectsCommand('attachments', positional, toFlags(args))
  },
})

const projectsLinksCommand = defineCommand({
  meta: { name: 'links', description: 'Manage project links' },
  args: {
    ...globalArgs,
    action: { type: 'positional' as const, description: 'Action: list, add, remove' },
    projectId: { type: 'positional' as const, description: 'Project ID' },
    urlOrId: { type: 'positional' as const, description: 'URL or link ID' },
    label: { type: 'string' as const, description: 'Link label (for add)' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    const positional = [args.action as string, args.projectId as string, args.urlOrId as string].filter(Boolean)
    await handleProjectsCommand('links', positional, toFlags(args))
  },
})

export const projectsCommand = defineCommand({
  meta: { name: 'projects', description: 'Manage projects' },
  subCommands: {
    list: projectsListCommand,
    get: projectsGetCommand,
    create: projectsCreateCommand,
    update: projectsUpdateCommand,
    delete: projectsDeleteCommand,
    scan: projectsScanCommand,
    tags: projectsTagsCommand,
    attachments: projectsAttachmentsCommand,
    links: projectsLinksCommand,
  },
})
