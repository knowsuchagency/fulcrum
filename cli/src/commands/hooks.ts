import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { CliError, ExitCodes } from '../utils/errors'
import { outputSuccess, prettyLog, isPrettyOutput } from '../utils/output'

interface ClaudeSettings {
  hooks?: {
    Stop?: Array<{
      matcher?: string
      hooks: Array<{
        type: 'command' | 'prompt'
        command?: string
        prompt?: string
        timeout?: number
      }>
    }>
  }
}

function getClaudeSettingsPath(global: boolean): string {
  if (global) {
    return path.join(os.homedir(), '.claude', 'settings.json')
  }
  return path.join(process.cwd(), '.claude', 'settings.json')
}

function readClaudeSettings(settingsPath: string): ClaudeSettings {
  if (!fs.existsSync(settingsPath)) {
    return {}
  }
  try {
    const content = fs.readFileSync(settingsPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

function writeClaudeSettings(settingsPath: string, settings: ClaudeSettings): void {
  const dir = path.dirname(settingsPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

function getViboraHookPath(): string {
  // Check if running from installed CLI or development
  const currentFile = fileURLToPath(import.meta.url)
  const scriptDir = path.dirname(currentFile)

  // Check common locations
  const possiblePaths = [
    // Installed via npm globally
    path.join(scriptDir, '..', 'scripts', 'vibora-plan-complete-hook'),
    // Development
    path.join(scriptDir, '..', '..', 'scripts', 'vibora-plan-complete-hook'),
    // In PATH
    'vibora-plan-complete-hook',
  ]

  for (const p of possiblePaths) {
    if (p === 'vibora-plan-complete-hook') {
      // Check if in PATH
      try {
        execSync('which vibora-plan-complete-hook', { stdio: 'pipe' })
        return 'vibora-plan-complete-hook'
      } catch {
        continue
      }
    } else if (fs.existsSync(p)) {
      return path.resolve(p)
    }
  }

  // Default to expecting it in PATH
  return 'vibora-plan-complete-hook'
}

function installStopHook(global: boolean): { settingsPath: string; hookCommand: string } {
  const settingsPath = getClaudeSettingsPath(global)
  const settings = readClaudeSettings(settingsPath)
  const hookCommand = getViboraHookPath()

  // Initialize hooks structure if not present
  if (!settings.hooks) {
    settings.hooks = {}
  }

  // Check if Stop hook already exists with our command
  const existingStopHooks = settings.hooks.Stop || []
  const hasViboraHook = existingStopHooks.some((hook) =>
    hook.hooks.some(
      (h) => h.type === 'command' && h.command?.includes('vibora-plan-complete-hook')
    )
  )

  if (hasViboraHook) {
    return { settingsPath, hookCommand }
  }

  // Add our Stop hook
  settings.hooks.Stop = [
    ...existingStopHooks,
    {
      hooks: [
        {
          type: 'command',
          command: hookCommand,
        },
      ],
    },
  ]

  writeClaudeSettings(settingsPath, settings)
  return { settingsPath, hookCommand }
}

function uninstallStopHook(global: boolean): { settingsPath: string; removed: boolean } {
  const settingsPath = getClaudeSettingsPath(global)
  const settings = readClaudeSettings(settingsPath)

  if (!settings.hooks?.Stop) {
    return { settingsPath, removed: false }
  }

  const originalLength = settings.hooks.Stop.length
  settings.hooks.Stop = settings.hooks.Stop.filter(
    (hook) =>
      !hook.hooks.some(
        (h) => h.type === 'command' && h.command?.includes('vibora-plan-complete-hook')
      )
  )

  const removed = settings.hooks.Stop.length < originalLength

  if (removed) {
    if (settings.hooks.Stop.length === 0) {
      delete settings.hooks.Stop
    }
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks
    }
    writeClaudeSettings(settingsPath, settings)
  }

  return { settingsPath, removed }
}

function checkStopHook(global: boolean): { installed: boolean; settingsPath: string; hookCommand?: string } {
  const settingsPath = getClaudeSettingsPath(global)
  const settings = readClaudeSettings(settingsPath)

  if (!settings.hooks?.Stop) {
    return { installed: false, settingsPath }
  }

  for (const hook of settings.hooks.Stop) {
    for (const h of hook.hooks) {
      if (h.type === 'command' && h.command?.includes('vibora-plan-complete-hook')) {
        return { installed: true, settingsPath, hookCommand: h.command }
      }
    }
  }

  return { installed: false, settingsPath }
}

export async function handleHooksCommand(
  action: string | undefined,
  _rest: string[],
  flags: Record<string, string>
): Promise<void> {
  const global = flags.global === 'true' || flags.g === 'true'

  switch (action) {
    case 'install': {
      const { settingsPath, hookCommand } = installStopHook(global)
      if (isPrettyOutput()) {
        prettyLog('success', `Installed Vibora Stop hook`)
        prettyLog('info', `  Settings: ${settingsPath}`)
        prettyLog('info', `  Command: ${hookCommand}`)
        prettyLog('info', '')
        prettyLog('info', 'The hook will automatically transition tasks to IN_REVIEW')
        prettyLog('info', 'when Claude Code finishes in a Vibora worktree.')
      } else {
        outputSuccess({
          action: 'install',
          settingsPath,
          hookCommand,
          message: 'Stop hook installed successfully',
        })
      }
      break
    }

    case 'uninstall': {
      const { settingsPath, removed } = uninstallStopHook(global)
      if (isPrettyOutput()) {
        if (removed) {
          prettyLog('success', `Removed Vibora Stop hook from ${settingsPath}`)
        } else {
          prettyLog('info', 'Vibora Stop hook was not installed')
        }
      } else {
        outputSuccess({
          action: 'uninstall',
          settingsPath,
          removed,
        })
      }
      break
    }

    case 'status': {
      const { installed, settingsPath, hookCommand } = checkStopHook(global)
      if (isPrettyOutput()) {
        if (installed) {
          prettyLog('success', 'Vibora Stop hook is installed')
          prettyLog('info', `  Settings: ${settingsPath}`)
          prettyLog('info', `  Command: ${hookCommand}`)
        } else {
          prettyLog('info', 'Vibora Stop hook is not installed')
          prettyLog('info', `  Settings: ${settingsPath}`)
          prettyLog('info', '')
          prettyLog('info', 'Run "vibora hooks install" to install it.')
        }
      } else {
        outputSuccess({
          action: 'status',
          installed,
          settingsPath,
          hookCommand,
        })
      }
      break
    }

    default:
      if (isPrettyOutput()) {
        console.log(`Usage: vibora hooks <action> [--global]

Actions:
  install     Install the Stop hook for auto task transitions
  uninstall   Remove the Stop hook
  status      Check if the Stop hook is installed

Options:
  --global    Use global Claude settings (~/.claude/settings.json)
              Default is project-local (.claude/settings.json)

The Stop hook automatically transitions tasks from IN_PROGRESS to IN_REVIEW
when Claude Code finishes in a Vibora worktree.`)
      } else {
        throw new CliError(
          'INVALID_ACTION',
          `Invalid hooks action: ${action}. Use install, uninstall, or status.`,
          ExitCodes.INVALID_ARGS
        )
      }
  }
}
