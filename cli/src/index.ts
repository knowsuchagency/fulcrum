#!/usr/bin/env bun

import { defineCommand, runMain } from 'citty'
import { consola } from 'consola'
import { handleCurrentTaskCommand } from './commands/current-task'
import { handleMcpCommand } from './commands/mcp'
import { handleTasksCommand } from './commands/tasks'
import { handleUpCommand } from './commands/up'
import { handleDownCommand } from './commands/down'
import { handleStatusCommand } from './commands/status'
import { handleGitCommand } from './commands/git'
import { handleWorktreesCommand } from './commands/worktrees'
import { handleConfigCommand } from './commands/config'
import { handleOpenCodeCommand } from './commands/opencode'
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
      description: 'Action: pr, linear, in-progress, review, done, cancel',
      required: false,
    },
    value: {
      type: 'positional' as const,
      description: 'Value for the action (URL for pr/linear)',
      required: false,
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
      description: 'Filter by status (IN_PROGRESS, IN_REVIEW, CANCELED)',
    },
    repo: {
      type: 'string' as const,
      description: 'Filter by repository name or path',
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
      description: 'Repository path',
      required: true,
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
      description: 'New status (IN_PROGRESS, IN_REVIEW, CANCELED)',
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
    await handleOpenCodeCommand('install', [], toFlags(args))
  },
})

const opencodeCommand = defineCommand({
  meta: {
    name: 'opencode',
    description: 'Manage OpenCode integration',
  },
  subCommands: {
    install: opencodeInstallCommand,
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
    description: 'Start Vibora server (daemon)',
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
    description: 'Stop Vibora server',
  },
  args: globalArgs,
  async run({ args }) {
    if (args.json) setJsonOutput(true)
    await handleDownCommand()
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
    description: 'Build and restart Vibora (developer mode)',
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
    name: 'vibora',
    version: VERSION,
    description: 'vibora CLI - Terminal-first AI agent orchestration',
  },
  args: globalArgs,
  subCommands: {
    'current-task': currentTaskCommand,
    tasks: tasksCommand,
    up: upCommand,
    down: downCommand,
    status: statusCommand,
    doctor: doctorCommand,
    git: gitCommand,
    worktrees: worktreesCommand,
    config: configCommand,
    opencode: opencodeCommand,
    notifications: notificationsCommand,
    notify: notifyCommand,
    dev: devCommand,
    mcp: mcpCommand,
  },
})

runMain(main)
