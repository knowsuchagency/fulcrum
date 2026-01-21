#!/usr/bin/env bun

import { defineCommand, runMain } from 'citty'
import { consola } from 'consola'

// Import command definitions
import { currentTaskCommand } from './commands/current-task'
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
import { updateCommand } from './commands/update'

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
    // Context-aware task operations (for working in a task worktree)
    'current-task': currentTaskCommand,

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
    update: updateCommand,

    // Migration
    'migrate-from-vibora': migrateFromViboraCommand,
  },
})

runMain(main)
