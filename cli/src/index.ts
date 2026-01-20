#!/usr/bin/env bun

import { defineCommand, runMain } from 'citty'
import { consola } from 'consola'
import { handleCurrentTaskCommand } from './commands/current-task'
import { handleMcpCommand } from './commands/mcp'
import { handleTasksCommand } from './commands/tasks'
import { handleProjectsCommand } from './commands/projects'
import { handleRepositoriesCommand } from './commands/repositories'
import { handleAppsCommand } from './commands/apps'
import { handleFsCommand } from './commands/fs'
import { handleUpCommand } from './commands/up'
import { handleDownCommand } from './commands/down'
import { handleMigrateFromViboraCommand } from './commands/migrate-from-vibora'
import { handleStatusCommand } from './commands/status'
import { handleGitCommand } from './commands/git'
import { handleWorktreesCommand } from './commands/worktrees'
import { handleConfigCommand } from './commands/config'
import { handleOpenCodeCommand } from './commands/opencode'
import { handleClaudeCommand } from './commands/claude'
import { handleNotificationsCommand } from './commands/notifications'
import { handleNotifyCommand } from './commands/notify'
import { handleDevCommand } from './commands/dev'
import { handleDoctorCommand } from './commands/doctor'
import { setJsonOutput } from './utils/output'
import pkg from '../../package.json'

const VERSION = pkg.version

// Suppress stack traces unless --debug is passed
// citty's runMain logs errors twice: once with full Error object, once with just message
// We filter out the Error object log to avoid duplicate messages and hide stack traces
if (!process.argv.includes('--debug')) {
  const defaultReporter = consola.options.reporters[0]
  consola.options.reporters = [
    {
      log: (logObj, ctx) => {
        // Skip Error objects - citty logs the message separately
        if (logObj.args[0] instanceof Error) {
          return
        }
        defaultReporter?.log?.(logObj, ctx)
      },
    },
  ]
}

// Global args shared across commands
const globalArgs = {
  port: {
    type: 'string' as const,
    description: 'Server port (default: 7777)',
  },
  url: {
    type: 'string' as const,
    description: 'Override full server URL',
  },
  json: {
    type: 'boolean' as const,
    description: 'Output as JSON',
  },
  debug: {
    type: 'boolean' as const,
    description: 'Show detailed error stack traces',
  },
}

// Helper to extract flags from Citty args
function toFlags(args: Record<string, unknown>): Record<string, string> {
  const flags: Record<string, string> = {}
  for (const [key, value] of Object.entries(args)) {
    if (value !== undefined && value !== false) {
      flags[key] = String(value)
    }
  }
  return flags
}

// ============================================================================
// Current Task Commands
// ============================================================================

const currentTaskCommand = defineCommand({
  meta: {
    name: 'current-task',
    description: 'Manage the task for the current worktree',
  },
  args: {
    ...globalArgs,
    action: {
      type: 'positional' as const,
      description: 'Action: pr, link, in-progress, review, done, cancel',
      required: false,
    },
    value: {
      type: 'positional' as const,
      description: 'Value for the action (URL for pr/link)',
      required: false,
    },
    label: {
      type: 'string' as const,
      description: 'Label for the link (used with link action)',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    const action = args.action as string | undefined
    const value = args.value as string | undefined
    const positional = value ? [value] : []
    await handleCurrentTaskCommand(action, positional, toFlags(args))
  },
})

// ============================================================================
// Tasks Commands
// ============================================================================

const tasksListCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List all tasks',
  },
  args: {
    ...globalArgs,
    status: {
      type: 'string' as const,
      description: 'Filter by status (TO_DO, IN_PROGRESS, IN_REVIEW, DONE, CANCELED)',
    },
    repo: {
      type: 'string' as const,
      description: 'Filter by repository name or path',
    },
    'project-id': {
      type: 'string' as const,
      description: 'Filter by project ID',
    },
    orphans: {
      type: 'boolean' as const,
      description: 'Show only orphan tasks (no project)',
    },
    label: {
      type: 'string' as const,
      description: 'Filter by label',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleTasksCommand('list', [], toFlags(args))
  },
})

const tasksGetCommand = defineCommand({
  meta: {
    name: 'get',
    description: 'Get a task by ID',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'Task ID',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleTasksCommand('get', [args.id as string], toFlags(args))
  },
})

const tasksCreateCommand = defineCommand({
  meta: {
    name: 'create',
    description: 'Create a new task',
  },
  args: {
    ...globalArgs,
    title: {
      type: 'string' as const,
      description: 'Task title',
      required: true,
    },
    repo: {
      type: 'string' as const,
      description: 'Repository path (optional for non-code tasks)',
    },
    'base-branch': {
      type: 'string' as const,
      description: 'Base branch (default: main)',
    },
    branch: {
      type: 'string' as const,
      description: 'Branch name',
    },
    description: {
      type: 'string' as const,
      description: 'Task description',
    },
    'repo-name': {
      type: 'string' as const,
      description: 'Repository name (default: basename of repo path)',
    },
    'worktree-path': {
      type: 'string' as const,
      description: 'Worktree path',
    },
    'project-id': {
      type: 'string' as const,
      description: 'Project ID to associate task with',
    },
    'repository-id': {
      type: 'string' as const,
      description: 'Repository ID for code tasks',
    },
    labels: {
      type: 'string' as const,
      description: 'Comma-separated labels (e.g., "bug,urgent")',
    },
    'due-date': {
      type: 'string' as const,
      description: 'Due date (YYYY-MM-DD format)',
    },
    status: {
      type: 'string' as const,
      description: 'Initial status (TO_DO, IN_PROGRESS). Default: IN_PROGRESS',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleTasksCommand('create', [], toFlags(args))
  },
})

const tasksUpdateCommand = defineCommand({
  meta: {
    name: 'update',
    description: 'Update a task',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'Task ID',
      required: true,
    },
    title: {
      type: 'string' as const,
      description: 'New title',
    },
    description: {
      type: 'string' as const,
      description: 'New description',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleTasksCommand('update', [args.id as string], toFlags(args))
  },
})

const tasksMoveCommand = defineCommand({
  meta: {
    name: 'move',
    description: 'Move a task to a different status',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'Task ID',
      required: true,
    },
    status: {
      type: 'string' as const,
      description: 'New status (TO_DO, IN_PROGRESS, IN_REVIEW, CANCELED)',
      required: true,
    },
    position: {
      type: 'string' as const,
      description: 'Position in the column',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleTasksCommand('move', [args.id as string], toFlags(args))
  },
})

const tasksDeleteCommand = defineCommand({
  meta: {
    name: 'delete',
    description: 'Delete a task',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'Task ID',
      required: true,
    },
    'delete-worktree': {
      type: 'boolean' as const,
      description: 'Also delete the linked worktree',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleTasksCommand('delete', [args.id as string], toFlags(args))
  },
})

const tasksAddLabelCommand = defineCommand({
  meta: {
    name: 'add-label',
    description: 'Add a label to a task',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'Task ID',
      required: true,
    },
    label: {
      type: 'positional' as const,
      description: 'Label to add',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleTasksCommand('add-label', [args.id as string, args.label as string], toFlags(args))
  },
})

const tasksRemoveLabelCommand = defineCommand({
  meta: {
    name: 'remove-label',
    description: 'Remove a label from a task',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'Task ID',
      required: true,
    },
    label: {
      type: 'positional' as const,
      description: 'Label to remove',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleTasksCommand('remove-label', [args.id as string, args.label as string], toFlags(args))
  },
})

const tasksSetDueDateCommand = defineCommand({
  meta: {
    name: 'set-due-date',
    description: 'Set or clear the due date for a task',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'Task ID',
      required: true,
    },
    date: {
      type: 'positional' as const,
      description: 'Due date (YYYY-MM-DD) or "none" to clear',
      required: false,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleTasksCommand('set-due-date', [args.id as string, (args.date as string) || ''], toFlags(args))
  },
})

const tasksAddDependencyCommand = defineCommand({
  meta: {
    name: 'add-dependency',
    description: 'Add a dependency (task depends on another task)',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'Task ID that will have the dependency',
      required: true,
    },
    'depends-on': {
      type: 'positional' as const,
      description: 'Task ID that must be completed first',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleTasksCommand('add-dependency', [args.id as string, args['depends-on'] as string], toFlags(args))
  },
})

const tasksRemoveDependencyCommand = defineCommand({
  meta: {
    name: 'remove-dependency',
    description: 'Remove a dependency',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'Task ID',
      required: true,
    },
    'dependency-id': {
      type: 'positional' as const,
      description: 'Dependency ID to remove',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleTasksCommand('remove-dependency', [args.id as string, args['dependency-id'] as string], toFlags(args))
  },
})

const tasksListDependenciesCommand = defineCommand({
  meta: {
    name: 'list-dependencies',
    description: 'List dependencies for a task',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'Task ID',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleTasksCommand('list-dependencies', [args.id as string], toFlags(args))
  },
})

const tasksCommand = defineCommand({
  meta: {
    name: 'tasks',
    description: 'Manage tasks',
  },
  subCommands: {
    list: tasksListCommand,
    get: tasksGetCommand,
    create: tasksCreateCommand,
    update: tasksUpdateCommand,
    move: tasksMoveCommand,
    delete: tasksDeleteCommand,
    'add-label': tasksAddLabelCommand,
    'remove-label': tasksRemoveLabelCommand,
    'set-due-date': tasksSetDueDateCommand,
    'add-dependency': tasksAddDependencyCommand,
    'remove-dependency': tasksRemoveDependencyCommand,
    'list-dependencies': tasksListDependenciesCommand,
  },
})

// ============================================================================
// Projects Commands
// ============================================================================

const projectsListCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List all projects',
  },
  args: {
    ...globalArgs,
    status: {
      type: 'string' as const,
      description: 'Filter by status (active, archived)',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleProjectsCommand('list', [], toFlags(args))
  },
})

const projectsGetCommand = defineCommand({
  meta: {
    name: 'get',
    description: 'Get a project by ID',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'Project ID',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleProjectsCommand('get', [args.id as string], toFlags(args))
  },
})

const projectsCreateCommand = defineCommand({
  meta: {
    name: 'create',
    description: 'Create a new project',
  },
  args: {
    ...globalArgs,
    name: {
      type: 'string' as const,
      description: 'Project name',
      required: true,
    },
    description: {
      type: 'string' as const,
      description: 'Project description',
    },
    'repository-id': {
      type: 'string' as const,
      description: 'Link to existing repository ID',
    },
    path: {
      type: 'string' as const,
      description: 'Create from local directory path',
    },
    url: {
      type: 'string' as const,
      description: 'Clone from git URL',
    },
    'target-dir': {
      type: 'string' as const,
      description: 'Target directory for cloning',
    },
    'folder-name': {
      type: 'string' as const,
      description: 'Folder name for cloned repo',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleProjectsCommand('create', [], toFlags(args))
  },
})

const projectsUpdateCommand = defineCommand({
  meta: {
    name: 'update',
    description: 'Update a project',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'Project ID',
      required: true,
    },
    name: {
      type: 'string' as const,
      description: 'New name',
    },
    description: {
      type: 'string' as const,
      description: 'New description',
    },
    status: {
      type: 'string' as const,
      description: 'New status (active, archived)',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleProjectsCommand('update', [args.id as string], toFlags(args))
  },
})

const projectsDeleteCommand = defineCommand({
  meta: {
    name: 'delete',
    description: 'Delete a project',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'Project ID',
      required: true,
    },
    'delete-directory': {
      type: 'boolean' as const,
      description: 'Also delete the repository directory',
    },
    'delete-app': {
      type: 'boolean' as const,
      description: 'Also delete the linked app',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleProjectsCommand('delete', [args.id as string], toFlags(args))
  },
})

const projectsScanCommand = defineCommand({
  meta: {
    name: 'scan',
    description: 'Scan a directory for git repositories',
  },
  args: {
    ...globalArgs,
    directory: {
      type: 'string' as const,
      description: 'Directory to scan',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleProjectsCommand('scan', [], toFlags(args))
  },
})

const projectsCommand = defineCommand({
  meta: {
    name: 'projects',
    description: 'Manage projects',
  },
  subCommands: {
    list: projectsListCommand,
    get: projectsGetCommand,
    create: projectsCreateCommand,
    update: projectsUpdateCommand,
    delete: projectsDeleteCommand,
    scan: projectsScanCommand,
  },
})

// ============================================================================
// Repositories Commands
// ============================================================================

const repositoriesListCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List all repositories',
  },
  args: {
    ...globalArgs,
    orphans: {
      type: 'boolean' as const,
      description: 'Show only orphan repositories (not linked to any project)',
    },
    'project-id': {
      type: 'string' as const,
      description: 'Filter by project ID',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleRepositoriesCommand('list', [], toFlags(args))
  },
})

const repositoriesGetCommand = defineCommand({
  meta: {
    name: 'get',
    description: 'Get a repository by ID',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'Repository ID',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleRepositoriesCommand('get', [args.id as string], toFlags(args))
  },
})

const repositoriesAddCommand = defineCommand({
  meta: {
    name: 'add',
    description: 'Add a new repository from a local path',
  },
  args: {
    ...globalArgs,
    path: {
      type: 'string' as const,
      description: 'Path to the git repository',
      required: true,
    },
    'display-name': {
      type: 'string' as const,
      description: 'Display name for the repository',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleRepositoriesCommand('add', [], toFlags(args))
  },
})

const repositoriesUpdateCommand = defineCommand({
  meta: {
    name: 'update',
    description: 'Update a repository',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'Repository ID',
      required: true,
    },
    'display-name': {
      type: 'string' as const,
      description: 'New display name',
    },
    'startup-script': {
      type: 'string' as const,
      description: 'Startup script to run when starting a task',
    },
    'copy-files': {
      type: 'string' as const,
      description: 'Files/patterns to copy to new worktrees',
    },
    'default-agent': {
      type: 'string' as const,
      description: 'Default agent (claude, opencode)',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleRepositoriesCommand('update', [args.id as string], toFlags(args))
  },
})

const repositoriesDeleteCommand = defineCommand({
  meta: {
    name: 'delete',
    description: 'Delete an orphaned repository',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'Repository ID',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleRepositoriesCommand('delete', [args.id as string], toFlags(args))
  },
})

const repositoriesLinkCommand = defineCommand({
  meta: {
    name: 'link',
    description: 'Link a repository to a project',
  },
  args: {
    ...globalArgs,
    'repo-id': {
      type: 'positional' as const,
      description: 'Repository ID',
      required: true,
    },
    'project-id': {
      type: 'positional' as const,
      description: 'Project ID',
      required: true,
    },
    'as-primary': {
      type: 'boolean' as const,
      description: 'Set as primary repository for the project',
    },
    force: {
      type: 'boolean' as const,
      description: 'Move repository from existing project if already linked',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleRepositoriesCommand(
      'link',
      [args['repo-id'] as string, args['project-id'] as string],
      toFlags(args)
    )
  },
})

const repositoriesUnlinkCommand = defineCommand({
  meta: {
    name: 'unlink',
    description: 'Unlink a repository from a project',
  },
  args: {
    ...globalArgs,
    'repo-id': {
      type: 'positional' as const,
      description: 'Repository ID',
      required: true,
    },
    'project-id': {
      type: 'positional' as const,
      description: 'Project ID',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleRepositoriesCommand(
      'unlink',
      [args['repo-id'] as string, args['project-id'] as string],
      toFlags(args)
    )
  },
})

const repositoriesCommand = defineCommand({
  meta: {
    name: 'repositories',
    description: 'Manage repositories',
  },
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

// ============================================================================
// Apps Commands
// ============================================================================

const appsListCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List all apps',
  },
  args: {
    ...globalArgs,
    status: {
      type: 'string' as const,
      description: 'Filter by status (stopped, building, running, failed)',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleAppsCommand('list', [], toFlags(args))
  },
})

const appsGetCommand = defineCommand({
  meta: {
    name: 'get',
    description: 'Get an app by ID',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'App ID',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleAppsCommand('get', [args.id as string], toFlags(args))
  },
})

const appsCreateCommand = defineCommand({
  meta: {
    name: 'create',
    description: 'Create a new app',
  },
  args: {
    ...globalArgs,
    name: {
      type: 'string' as const,
      description: 'App name',
      required: true,
    },
    'repository-id': {
      type: 'string' as const,
      description: 'Repository ID',
      required: true,
    },
    branch: {
      type: 'string' as const,
      description: 'Git branch (default: main)',
    },
    'compose-file': {
      type: 'string' as const,
      description: 'Path to compose file',
    },
    'auto-deploy': {
      type: 'boolean' as const,
      description: 'Enable auto-deploy on git push',
    },
    'no-cache': {
      type: 'boolean' as const,
      description: 'Disable Docker build cache',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleAppsCommand('create', [], toFlags(args))
  },
})

const appsUpdateCommand = defineCommand({
  meta: {
    name: 'update',
    description: 'Update an app',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'App ID',
      required: true,
    },
    name: {
      type: 'string' as const,
      description: 'New name',
    },
    branch: {
      type: 'string' as const,
      description: 'New branch',
    },
    'auto-deploy': {
      type: 'boolean' as const,
      description: 'Enable/disable auto-deploy',
    },
    'no-cache': {
      type: 'boolean' as const,
      description: 'Enable/disable no-cache build',
    },
    notifications: {
      type: 'boolean' as const,
      description: 'Enable/disable notifications',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleAppsCommand('update', [args.id as string], toFlags(args))
  },
})

const appsDeleteCommand = defineCommand({
  meta: {
    name: 'delete',
    description: 'Delete an app',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'App ID',
      required: true,
    },
    'keep-containers': {
      type: 'boolean' as const,
      description: 'Keep containers running',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleAppsCommand('delete', [args.id as string], toFlags(args))
  },
})

const appsDeployCommand = defineCommand({
  meta: {
    name: 'deploy',
    description: 'Deploy an app',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'App ID',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleAppsCommand('deploy', [args.id as string], toFlags(args))
  },
})

const appsStopCommand = defineCommand({
  meta: {
    name: 'stop',
    description: 'Stop an app',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'App ID',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleAppsCommand('stop', [args.id as string], toFlags(args))
  },
})

const appsLogsCommand = defineCommand({
  meta: {
    name: 'logs',
    description: 'Get app logs',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'App ID',
      required: true,
    },
    service: {
      type: 'string' as const,
      description: 'Service name',
    },
    tail: {
      type: 'string' as const,
      description: 'Number of lines (default: 100)',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleAppsCommand('logs', [args.id as string], toFlags(args))
  },
})

const appsStatusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Get app container status',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'App ID',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleAppsCommand('status', [args.id as string], toFlags(args))
  },
})

const appsDeploymentsCommand = defineCommand({
  meta: {
    name: 'deployments',
    description: 'Get deployment history',
  },
  args: {
    ...globalArgs,
    id: {
      type: 'positional' as const,
      description: 'App ID',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleAppsCommand('deployments', [args.id as string], toFlags(args))
  },
})

const appsCommand = defineCommand({
  meta: {
    name: 'apps',
    description: 'Manage apps',
  },
  subCommands: {
    list: appsListCommand,
    get: appsGetCommand,
    create: appsCreateCommand,
    update: appsUpdateCommand,
    delete: appsDeleteCommand,
    deploy: appsDeployCommand,
    stop: appsStopCommand,
    logs: appsLogsCommand,
    status: appsStatusCommand,
    deployments: appsDeploymentsCommand,
  },
})

// ============================================================================
// Filesystem Commands
// ============================================================================

const fsListCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List directory contents',
  },
  args: {
    ...globalArgs,
    path: {
      type: 'string' as const,
      description: 'Directory path',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleFsCommand('list', [], toFlags(args))
  },
})

const fsTreeCommand = defineCommand({
  meta: {
    name: 'tree',
    description: 'Get file tree',
  },
  args: {
    ...globalArgs,
    root: {
      type: 'string' as const,
      description: 'Root directory',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleFsCommand('tree', [], toFlags(args))
  },
})

const fsReadCommand = defineCommand({
  meta: {
    name: 'read',
    description: 'Read a file',
  },
  args: {
    ...globalArgs,
    path: {
      type: 'string' as const,
      description: 'File path (relative to root)',
      required: true,
    },
    root: {
      type: 'string' as const,
      description: 'Root directory for security boundary',
      required: true,
    },
    'max-lines': {
      type: 'string' as const,
      description: 'Maximum lines to return',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleFsCommand('read', [], toFlags(args))
  },
})

const fsWriteCommand = defineCommand({
  meta: {
    name: 'write',
    description: 'Write to a file',
  },
  args: {
    ...globalArgs,
    path: {
      type: 'string' as const,
      description: 'File path (relative to root)',
      required: true,
    },
    root: {
      type: 'string' as const,
      description: 'Root directory for security boundary',
      required: true,
    },
    content: {
      type: 'string' as const,
      description: 'Content to write',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleFsCommand('write', [], toFlags(args))
  },
})

const fsStatCommand = defineCommand({
  meta: {
    name: 'stat',
    description: 'Get file/directory metadata',
  },
  args: {
    ...globalArgs,
    path: {
      type: 'string' as const,
      description: 'Path to check',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleFsCommand('stat', [], toFlags(args))
  },
})

const fsEditCommand = defineCommand({
  meta: {
    name: 'edit',
    description: 'Edit a file by replacing an exact string',
  },
  args: {
    ...globalArgs,
    path: {
      type: 'string' as const,
      description: 'File path (relative to root)',
      required: true,
    },
    root: {
      type: 'string' as const,
      description: 'Root directory for security boundary',
      required: true,
    },
    'old-string': {
      type: 'string' as const,
      description: 'Exact string to find (must appear exactly once)',
      required: true,
    },
    'new-string': {
      type: 'string' as const,
      description: 'String to replace it with',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleFsCommand('edit', [], toFlags(args))
  },
})

const fsCommand = defineCommand({
  meta: {
    name: 'fs',
    description: 'Remote filesystem operations (read/write/edit files on the Fulcrum server)',
  },
  subCommands: {
    list: fsListCommand,
    tree: fsTreeCommand,
    read: fsReadCommand,
    write: fsWriteCommand,
    edit: fsEditCommand,
    stat: fsStatCommand,
  },
})

// ============================================================================
// Git Commands
// ============================================================================

const gitStatusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Get git status for a worktree',
  },
  args: {
    ...globalArgs,
    path: {
      type: 'string' as const,
      description: 'Repository path (default: current directory)',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleGitCommand('status', toFlags(args))
  },
})

const gitDiffCommand = defineCommand({
  meta: {
    name: 'diff',
    description: 'Get git diff for a worktree',
  },
  args: {
    ...globalArgs,
    path: {
      type: 'string' as const,
      description: 'Repository path (default: current directory)',
    },
    staged: {
      type: 'boolean' as const,
      description: 'Show staged changes only',
    },
    'ignore-whitespace': {
      type: 'boolean' as const,
      description: 'Ignore whitespace changes',
    },
    'include-untracked': {
      type: 'boolean' as const,
      description: 'Include untracked files',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleGitCommand('diff', toFlags(args))
  },
})

const gitBranchesCommand = defineCommand({
  meta: {
    name: 'branches',
    description: 'List branches in a repository',
  },
  args: {
    ...globalArgs,
    repo: {
      type: 'string' as const,
      description: 'Repository path',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleGitCommand('branches', toFlags(args))
  },
})

const gitCommand = defineCommand({
  meta: {
    name: 'git',
    description: 'Git operations',
  },
  subCommands: {
    status: gitStatusCommand,
    diff: gitDiffCommand,
    branches: gitBranchesCommand,
  },
})

// ============================================================================
// Worktrees Commands
// ============================================================================

const worktreesListCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List all worktrees',
  },
  args: {
    ...globalArgs,
    repo: {
      type: 'string' as const,
      description: 'Repository path',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleWorktreesCommand('list', toFlags(args))
  },
})

const worktreesDeleteCommand = defineCommand({
  meta: {
    name: 'delete',
    description: 'Delete a worktree',
  },
  args: {
    ...globalArgs,
    path: {
      type: 'string' as const,
      description: 'Worktree path',
      required: true,
    },
    force: {
      type: 'boolean' as const,
      description: 'Force deletion',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleWorktreesCommand('delete', toFlags(args))
  },
})

const worktreesCommand = defineCommand({
  meta: {
    name: 'worktrees',
    description: 'Manage git worktrees',
  },
  subCommands: {
    list: worktreesListCommand,
    delete: worktreesDeleteCommand,
  },
})

// ============================================================================
// Config Commands
// ============================================================================

const configListCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List all config values',
  },
  args: globalArgs,
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleConfigCommand('list', [], toFlags(args))
  },
})

const configGetCommand = defineCommand({
  meta: {
    name: 'get',
    description: 'Get a config value',
  },
  args: {
    ...globalArgs,
    key: {
      type: 'positional' as const,
      description: 'Config key',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleConfigCommand('get', [args.key as string], toFlags(args))
  },
})

const configSetCommand = defineCommand({
  meta: {
    name: 'set',
    description: 'Set a config value',
  },
  args: {
    ...globalArgs,
    key: {
      type: 'positional' as const,
      description: 'Config key',
      required: true,
    },
    value: {
      type: 'positional' as const,
      description: 'Config value',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleConfigCommand('set', [args.key as string, args.value as string], toFlags(args))
  },
})

const configResetCommand = defineCommand({
  meta: {
    name: 'reset',
    description: 'Reset a config value to default',
  },
  args: {
    ...globalArgs,
    key: {
      type: 'positional' as const,
      description: 'Config key',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleConfigCommand('reset', [args.key as string], toFlags(args))
  },
})

const configCommand = defineCommand({
  meta: {
    name: 'config',
    description: 'Manage configuration',
  },
  subCommands: {
    list: configListCommand,
    get: configGetCommand,
    set: configSetCommand,
    reset: configResetCommand,
  },
})

// ============================================================================
// OpenCode Commands
// ============================================================================

const opencodeInstallCommand = defineCommand({
  meta: {
    name: 'install',
    description: 'Install the OpenCode plugin',
  },
  args: globalArgs,
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleOpenCodeCommand('install')
  },
})

const opencodeUninstallCommand = defineCommand({
  meta: {
    name: 'uninstall',
    description: 'Uninstall the OpenCode plugin',
  },
  args: globalArgs,
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleOpenCodeCommand('uninstall')
  },
})

const opencodeCommand = defineCommand({
  meta: {
    name: 'opencode',
    description: 'Manage OpenCode integration',
  },
  subCommands: {
    install: opencodeInstallCommand,
    uninstall: opencodeUninstallCommand,
  },
})

// ============================================================================
// Claude Commands
// ============================================================================

const claudeInstallCommand = defineCommand({
  meta: {
    name: 'install',
    description: 'Install Fulcrum plugin for Claude Code',
  },
  async run() {
    await handleClaudeCommand('install')
  },
})

const claudeUninstallCommand = defineCommand({
  meta: {
    name: 'uninstall',
    description: 'Uninstall Fulcrum plugin from Claude Code',
  },
  async run() {
    await handleClaudeCommand('uninstall')
  },
})

const claudeCommand = defineCommand({
  meta: {
    name: 'claude',
    description: 'Manage Claude Code integration',
  },
  subCommands: {
    install: claudeInstallCommand,
    uninstall: claudeUninstallCommand,
  },
})

// ============================================================================
// Notifications Commands
// ============================================================================

const notificationsStatusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Show notification settings',
  },
  args: globalArgs,
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleNotificationsCommand('status', [], toFlags(args))
  },
})

const notificationsEnableCommand = defineCommand({
  meta: {
    name: 'enable',
    description: 'Enable notifications',
  },
  args: globalArgs,
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleNotificationsCommand('enable', [], toFlags(args))
  },
})

const notificationsDisableCommand = defineCommand({
  meta: {
    name: 'disable',
    description: 'Disable notifications',
  },
  args: globalArgs,
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleNotificationsCommand('disable', [], toFlags(args))
  },
})

const notificationsTestCommand = defineCommand({
  meta: {
    name: 'test',
    description: 'Test a notification channel',
  },
  args: {
    ...globalArgs,
    channel: {
      type: 'positional' as const,
      description: 'Channel to test (sound, slack, discord, pushover)',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleNotificationsCommand('test', [args.channel as string], toFlags(args))
  },
})

const notificationsSetCommand = defineCommand({
  meta: {
    name: 'set',
    description: 'Set a notification channel config',
  },
  args: {
    ...globalArgs,
    channel: {
      type: 'positional' as const,
      description: 'Channel (sound, slack, discord, pushover)',
      required: true,
    },
    key: {
      type: 'positional' as const,
      description: 'Config key',
      required: true,
    },
    value: {
      type: 'positional' as const,
      description: 'Config value',
      required: true,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleNotificationsCommand(
      'set',
      [args.channel as string, args.key as string, args.value as string],
      toFlags(args)
    )
  },
})

const notificationsCommand = defineCommand({
  meta: {
    name: 'notifications',
    description: 'Manage notification settings',
  },
  args: globalArgs,
  subCommands: {
    status: notificationsStatusCommand,
    enable: notificationsEnableCommand,
    disable: notificationsDisableCommand,
    test: notificationsTestCommand,
    set: notificationsSetCommand,
  },
  async run({ args }) {
    // Default to status when no subcommand
    if (args.json) setJsonOutput(true)
    await handleNotificationsCommand(undefined, [], toFlags(args))
  },
})

// ============================================================================
// Simple Commands (no subcommands)
// ============================================================================

const upCommand = defineCommand({
  meta: {
    name: 'up',
    description: 'Start Fulcrum server (daemon)',
  },
  args: {
    ...globalArgs,
    yes: {
      type: 'boolean' as const,
      alias: 'y',
      description: 'Auto-confirm prompts (for CI/automation)',
    },
    host: {
      type: 'boolean' as const,
      description: 'Bind to all interfaces',
    },
    debug: {
      type: 'boolean' as const,
      description: 'Enable debug logging',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleUpCommand(toFlags(args))
  },
})

const downCommand = defineCommand({
  meta: {
    name: 'down',
    description: 'Stop Fulcrum server',
  },
  args: globalArgs,
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleDownCommand()
  },
})

const migrateFromViboraCommand = defineCommand({
  meta: {
    name: 'migrate-from-vibora',
    description: 'Migrate data from ~/.vibora to ~/.fulcrum',
  },
  args: {
    ...globalArgs,
    yes: {
      type: 'boolean' as const,
      alias: 'y',
      description: 'Auto-confirm prompts (for CI/automation)',
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleMigrateFromViboraCommand(toFlags(args))
  },
})

const statusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Check if server is running',
  },
  args: globalArgs,
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleStatusCommand(toFlags(args))
  },
})

const doctorCommand = defineCommand({
  meta: {
    name: 'doctor',
    description: 'Check all dependencies and show versions',
  },
  args: globalArgs,
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleDoctorCommand(toFlags(args))
  },
})

const notifyCommand = defineCommand({
  meta: {
    name: 'notify',
    description: 'Send a notification to all enabled channels',
  },
  args: {
    ...globalArgs,
    title: {
      type: 'positional' as const,
      description: 'Notification title',
      required: false,
    },
    message: {
      type: 'positional' as const,
      description: 'Notification message',
      required: false,
    },
  },
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    // Collect positional args, handling title from flag too
    const positional: string[] = []
    if (args.title) positional.push(args.title as string)
    if (args.message) positional.push(args.message as string)
    await handleNotifyCommand(positional, toFlags(args))
  },
})

const devRestartCommand = defineCommand({
  meta: {
    name: 'restart',
    description: 'Build and restart Fulcrum (developer mode)',
  },
  args: globalArgs,
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleDevCommand('restart', toFlags(args))
  },
})

const devStatusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Check if developer mode is enabled',
  },
  args: globalArgs,
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleDevCommand('status', toFlags(args))
  },
})

const devCommand = defineCommand({
  meta: {
    name: 'dev',
    description: 'Developer mode commands',
  },
  subCommands: {
    restart: devRestartCommand,
    status: devStatusCommand,
  },
})

const mcpCommand = defineCommand({
  meta: {
    name: 'mcp',
    description: 'Start MCP server (stdio transport)',
  },
  args: globalArgs,
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleMcpCommand(toFlags(args))
  },
})

// ============================================================================
// Main Command
// ============================================================================

const main = defineCommand({
  meta: {
    name: 'fulcrum',
    version: VERSION,
    description: 'fulcrum CLI - Terminal-first AI agent orchestration',
  },
  args: globalArgs,
  subCommands: {
    'current-task': currentTaskCommand,
    tasks: tasksCommand,
    projects: projectsCommand,
    repositories: repositoriesCommand,
    apps: appsCommand,
    fs: fsCommand,
    up: upCommand,
    down: downCommand,
    'migrate-from-vibora': migrateFromViboraCommand,
    status: statusCommand,
    doctor: doctorCommand,
    git: gitCommand,
    worktrees: worktreesCommand,
    config: configCommand,
    opencode: opencodeCommand,
    claude: claudeCommand,
    notifications: notificationsCommand,
    notify: notifyCommand,
    dev: devCommand,
    mcp: mcpCommand,
  },
})

runMain(main)
