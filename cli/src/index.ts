#!/usr/bin/env bun

import { handleCurrentTaskCommand } from './commands/current-task'
import { handleTasksCommand } from './commands/tasks'
import { handleUpCommand } from './commands/up'
import { handleDownCommand } from './commands/down'
import { handleStatusCommand } from './commands/status'
import { handleGitCommand } from './commands/git'
import { handleWorktreesCommand } from './commands/worktrees'
import { handleConfigCommand } from './commands/config'
import { handleHealthCommand } from './commands/health'
import { handleNotificationsCommand } from './commands/notifications'
import { handleNotifyCommand } from './commands/notify'
import { handleDevCommand } from './commands/dev'
import { outputError, setPrettyOutput } from './utils/output'
import { CliError, ExitCodes } from './utils/errors'

const VERSION = '0.1.0'

/**
 * Parse command line arguments into flags and positional args.
 * Supports: --flag=value, --flag value, --flag (boolean)
 */
function parseArgs(args: string[]): {
  positional: string[]
  flags: Record<string, string>
} {
  const positional: string[] = []
  const flags: Record<string, string> = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=')
      if (eqIndex !== -1) {
        // --flag=value
        const key = arg.slice(2, eqIndex)
        const value = arg.slice(eqIndex + 1)
        flags[key] = value
      } else {
        // --flag or --flag value
        const key = arg.slice(2)
        const nextArg = args[i + 1]
        if (nextArg && !nextArg.startsWith('--')) {
          flags[key] = nextArg
          i++
        } else {
          flags[key] = 'true'
        }
      }
    } else {
      positional.push(arg)
    }
  }

  return { positional, flags }
}

async function main() {
  // Use process.argv for Node compatibility (bunx runs with node shebang)
  const args = process.argv.slice(2)
  const { positional, flags } = parseArgs(args)

  // Handle global flags
  if (flags.pretty) {
    setPrettyOutput(true)
  }

  const [command, ...rest] = positional

  // Handle --version
  if (flags.version || command === '--version') {
    console.log(JSON.stringify({ success: true, data: { version: VERSION } }))
    process.exit(0)
  }

  // Handle --help or no command
  if (flags.help || command === '--help' || !command) {
    console.log(`vibora CLI v${VERSION}

Usage: vibora <command> [options]

Commands:
  current-task              Get task for current worktree
  current-task pr <url>     Associate a PR with current task
  current-task in-progress  Mark current task as IN_PROGRESS
  current-task review       Mark current task as IN_REVIEW
  current-task done         Mark current task as DONE
  current-task cancel       Mark current task as CANCELED

  tasks list                List all tasks
  tasks get <id>            Get a task by ID
  tasks create              Create a new task
  tasks update <id>         Update a task
  tasks move <id>           Move task to different status
  tasks delete <id>         Delete a task

  up [--host] [--debug]     Start Vibora server (daemon)
  down                      Stop Vibora server
  status                    Check if server is running

  git status                Get git status for worktree
  git diff                  Get git diff for worktree
  git branches              List branches in a repo

  worktrees list            List all worktrees
  worktrees delete          Delete a worktree

  config get <key>          Get a config value
  config set <key> <value>  Set a config value

  notifications             Show notification settings
  notifications enable      Enable notifications
  notifications disable     Disable notifications
  notifications test <ch>   Test a channel (sound, slack, discord, pushover)
  notifications set <ch> <key> <value>
                            Set a channel config (e.g., slack webhookUrl <url>)

  notify <title> [message]  Send a notification to all enabled channels

  health                    Check server health

  dev restart               Build and restart Vibora (developer mode)
  dev status                Check if developer mode is enabled

Global Options:
  --port=<port>     Server port (default: 7777)
  --url=<url>       Override full server URL
  --pretty          Pretty-print JSON output
  --version         Show version
  --help            Show this help

Examples:
  vibora current-task                    # Get current task info
  vibora current-task review             # Mark current task as IN_REVIEW
  vibora tasks list --status=IN_PROGRESS # List in-progress tasks
  vibora tasks create --title="My Task" --repo=/path/to/repo
`)
    process.exit(0)
  }

  try {
    switch (command) {
      case 'current-task': {
        const [action, ...actionRest] = rest
        await handleCurrentTaskCommand(action, actionRest, flags)
        break
      }

      case 'tasks': {
        const [action, ...taskRest] = rest
        await handleTasksCommand(action, taskRest, flags)
        break
      }

      case 'up': {
        await handleUpCommand(flags)
        break
      }

      case 'down': {
        await handleDownCommand()
        break
      }

      case 'status': {
        await handleStatusCommand(flags)
        break
      }

      case 'git': {
        const [action] = rest
        await handleGitCommand(action, flags)
        break
      }

      case 'worktrees': {
        const [action] = rest
        await handleWorktreesCommand(action, flags)
        break
      }

      case 'config': {
        const [action, ...configRest] = rest
        await handleConfigCommand(action, configRest, flags)
        break
      }

      case 'health': {
        await handleHealthCommand(flags)
        break
      }

      case 'notifications': {
        const [action, ...notificationsRest] = rest
        await handleNotificationsCommand(action, notificationsRest, flags)
        break
      }

      case 'notify': {
        await handleNotifyCommand(rest, flags)
        break
      }

      case 'dev': {
        const [action] = rest
        await handleDevCommand(action, flags)
        break
      }

      default:
        throw new CliError('UNKNOWN_COMMAND', `Unknown command: ${command}`, ExitCodes.INVALID_ARGS)
    }
  } catch (err) {
    if (err instanceof CliError) {
      outputError(err)
    }
    // Re-throw unexpected errors
    throw err
  }
}

main()
