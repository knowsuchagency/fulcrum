#!/usr/bin/env bun

import { defineCommand, runMain } from 'citty'
import { consola } from 'consola'

// Import command definitions
import { currentTaskCommand } from './commands/current-task'
import { tasksCommand } from './commands/tasks'
import { projectsCommand } from './commands/projects'
import { repositoriesCommand } from './commands/repositories'
import { appsCommand } from './commands/apps'
import { fsCommand } from './commands/fs'
import { gitCommand } from './commands/git'
import { worktreesCommand } from './commands/worktrees'
import { configCommand } from './commands/config'
import { opencodeCommand } from './commands/opencode'
import { claudeCommand } from './commands/claude'
import { notificationsCommand } from './commands/notifications'
import { notifyCommand } from './commands/notify'
import { upCommand } from './commands/up'
import { downCommand } from './commands/down'
import { statusCommand } from './commands/status'
import { doctorCommand } from './commands/doctor'
import { devCommand } from './commands/dev'
import { mcpCommand } from './commands/mcp'
import { migrateFromViboraCommand } from './commands/migrate-from-vibora'

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

// ============================================================================
// Main CLI
// ============================================================================

const main = defineCommand({
  meta: {
    name: 'fulcrum',
    version: VERSION,
    description: 'Fulcrum - Terminal-first AI agent orchestration',
  },
  subCommands: {
    // Current task commands (for working in a task worktree)
    'current-task': currentTaskCommand,

    // Task management
    tasks: tasksCommand,

    // Project management
    projects: projectsCommand,

    // Repository management
    repositories: repositoriesCommand,

    // App deployment
    apps: appsCommand,

    // Filesystem operations
    fs: fsCommand,

    // Git operations
    git: gitCommand,

    // Worktree management
    worktrees: worktreesCommand,

    // Configuration
    config: configCommand,

    // Agent integrations
    opencode: opencodeCommand,
    claude: claudeCommand,

    // Notifications
    notifications: notificationsCommand,
    notify: notifyCommand,

    // Server management
    up: upCommand,
    down: downCommand,
    status: statusCommand,
    doctor: doctorCommand,
    dev: devCommand,
    mcp: mcpCommand,

    // Migration
    'migrate-from-vibora': migrateFromViboraCommand,
  },
})

runMain(main)
