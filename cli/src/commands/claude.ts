import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CliError, ExitCodes } from '../utils/errors'

// Plugin bundle: import all files as text using Bun
// @ts-expect-error - Bun text import
import PLUGIN_JSON from '../../../plugins/fulcrum/.claude-plugin/plugin.json' with { type: 'text' }
// @ts-expect-error - Bun text import
import HOOKS_JSON from '../../../plugins/fulcrum/hooks/hooks.json' with { type: 'text' }
// @ts-expect-error - Bun text import
import MCP_JSON from '../../../plugins/fulcrum/mcp.json' with { type: 'text' }
// @ts-expect-error - Bun text import
import CMD_PR from '../../../plugins/fulcrum/commands/pr.md' with { type: 'text' }
// @ts-expect-error - Bun text import
import CMD_TASK_INFO from '../../../plugins/fulcrum/commands/task-info.md' with { type: 'text' }
// @ts-expect-error - Bun text import
import CMD_NOTIFY from '../../../plugins/fulcrum/commands/notify.md' with { type: 'text' }
// @ts-expect-error - Bun text import
import CMD_LINEAR from '../../../plugins/fulcrum/commands/linear.md' with { type: 'text' }
// @ts-expect-error - Bun text import
import CMD_REVIEW from '../../../plugins/fulcrum/commands/review.md' with { type: 'text' }
// @ts-expect-error - Bun text import
import SKILL_VIBORA from '../../../plugins/fulcrum/skills/vibora/SKILL.md' with { type: 'text' }

// Plugin location: ~/.claude/plugins/fulcrum/
const PLUGIN_DIR = join(homedir(), '.claude', 'plugins', 'fulcrum')

// Plugin file structure to create
const PLUGIN_FILES: Array<{ path: string; content: string }> = [
  { path: '.claude-plugin/plugin.json', content: PLUGIN_JSON },
  { path: 'hooks/hooks.json', content: HOOKS_JSON },
  { path: 'mcp.json', content: MCP_JSON },
  { path: 'commands/pr.md', content: CMD_PR },
  { path: 'commands/task-info.md', content: CMD_TASK_INFO },
  { path: 'commands/notify.md', content: CMD_NOTIFY },
  { path: 'commands/linear.md', content: CMD_LINEAR },
  { path: 'commands/review.md', content: CMD_REVIEW },
  { path: 'skills/vibora/SKILL.md', content: SKILL_VIBORA },
]

export async function handleClaudeCommand(action: string | undefined) {
  if (action === 'install') {
    await installClaudePlugin()
    return
  }

  if (action === 'uninstall') {
    await uninstallClaudePlugin()
    return
  }

  throw new CliError(
    'INVALID_ACTION',
    'Unknown action. Usage: fulcrum claude install | fulcrum claude uninstall',
    ExitCodes.INVALID_ARGS
  )
}

async function installClaudePlugin() {
  try {
    console.log('Installing Claude Code plugin...')

    // Remove existing installation if present
    if (existsSync(PLUGIN_DIR)) {
      console.log('• Removing existing plugin installation...')
      rmSync(PLUGIN_DIR, { recursive: true })
    }

    // Create plugin directory structure and write files
    for (const file of PLUGIN_FILES) {
      const fullPath = join(PLUGIN_DIR, file.path)
      const dir = fullPath.substring(0, fullPath.lastIndexOf('/'))
      mkdirSync(dir, { recursive: true })
      writeFileSync(fullPath, file.content, 'utf-8')
    }

    console.log('✓ Installed plugin at ' + PLUGIN_DIR)
    console.log('')
    console.log('Installation complete! Restart Claude Code to apply changes.')
  } catch (err) {
    throw new CliError(
      'INSTALL_FAILED',
      `Failed to install Claude plugin: ${err instanceof Error ? err.message : String(err)}`,
      ExitCodes.ERROR
    )
  }
}

async function uninstallClaudePlugin() {
  try {
    if (existsSync(PLUGIN_DIR)) {
      rmSync(PLUGIN_DIR, { recursive: true })
      console.log('✓ Removed plugin from ' + PLUGIN_DIR)
      console.log('')
      console.log('Uninstall complete! Restart Claude Code to apply changes.')
    } else {
      console.log('Nothing to uninstall. Plugin not found at ' + PLUGIN_DIR)
    }
  } catch (err) {
    throw new CliError(
      'UNINSTALL_FAILED',
      `Failed to uninstall Claude plugin: ${err instanceof Error ? err.message : String(err)}`,
      ExitCodes.ERROR
    )
  }
}
