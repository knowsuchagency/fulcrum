import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { defineCommand } from 'citty'
import { CliError, ExitCodes } from '../utils/errors'
import { globalArgs } from './shared'

// Plugin bundle: import all files as text using Bun
// @ts-expect-error - Bun text import
import MARKETPLACE_JSON from '../../../plugins/fulcrum/.claude-plugin/marketplace.json' with { type: 'text' }
// @ts-expect-error - Bun text import
import HOOKS_JSON from '../../../plugins/fulcrum/hooks/hooks.json' with { type: 'text' }
// @ts-expect-error - Bun text import
import MCP_JSON from '../../../plugins/fulcrum/.mcp.json' with { type: 'text' }
// @ts-expect-error - Bun text import
import CMD_PR from '../../../plugins/fulcrum/commands/pr.md' with { type: 'text' }
// @ts-expect-error - Bun text import
import CMD_TASK_INFO from '../../../plugins/fulcrum/commands/task-info.md' with { type: 'text' }
// @ts-expect-error - Bun text import
import CMD_NOTIFY from '../../../plugins/fulcrum/commands/notify.md' with { type: 'text' }
// @ts-expect-error - Bun text import
import SKILL_FULCRUM from '../../../plugins/fulcrum/skills/fulcrum/SKILL.md' with { type: 'text' }

// Marketplace location - where we stage plugin files before installation
const MARKETPLACE_DIR = join(homedir(), '.fulcrum', 'claude-plugin')
const MARKETPLACE_NAME = 'fulcrum'
const PLUGIN_NAME = 'fulcrum'
const PLUGIN_ID = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`

// Plugin files to copy to marketplace directory
const PLUGIN_FILES: Array<{ path: string; content: string }> = [
  { path: '.claude-plugin/marketplace.json', content: MARKETPLACE_JSON },
  { path: 'hooks/hooks.json', content: HOOKS_JSON },
  { path: '.mcp.json', content: MCP_JSON },
  { path: 'commands/pr.md', content: CMD_PR },
  { path: 'commands/task-info.md', content: CMD_TASK_INFO },
  { path: 'commands/notify.md', content: CMD_NOTIFY },
  { path: 'skills/fulcrum/SKILL.md', content: SKILL_FULCRUM },
]

// Legacy paths for cleanup
const LEGACY_PLUGIN_DIR = join(homedir(), '.claude', 'plugins', 'fulcrum')
const LEGACY_CACHE_DIR = join(homedir(), '.claude', 'plugins', 'cache', 'fulcrum')

function runClaude(args: string[]): { success: boolean; output: string } {
  const result = spawnSync('claude', args, { encoding: 'utf-8' })
  return {
    success: result.status === 0,
    output: (result.stdout || '') + (result.stderr || ''),
  }
}

function getBundledVersion(): string {
  try {
    const parsed = JSON.parse(MARKETPLACE_JSON)
    return parsed.plugins?.[0]?.version || '1.0.0'
  } catch {
    return '1.0.0'
  }
}

function getInstalledVersion(): string | null {
  const installedMarketplace = join(MARKETPLACE_DIR, '.claude-plugin', 'marketplace.json')
  if (!existsSync(installedMarketplace)) {
    return null
  }

  try {
    const installed = JSON.parse(readFileSync(installedMarketplace, 'utf-8'))
    return installed.plugins?.[0]?.version || null
  } catch {
    return null
  }
}

async function handleClaudeCommand(action: string | undefined) {
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

// Check if plugin needs to be installed or updated
export function needsPluginUpdate(): boolean {
  const installedVersion = getInstalledVersion()
  if (!installedVersion) {
    return true // Not installed
  }

  const bundledVersion = getBundledVersion()
  return installedVersion !== bundledVersion
}

export async function installClaudePlugin(options: { silent?: boolean } = {}) {
  const { silent = false } = options
  const log = silent ? () => {} : console.log

  try {
    log('Installing Claude Code plugin...')

    // 1. Create marketplace directory with plugin files
    if (existsSync(MARKETPLACE_DIR)) {
      rmSync(MARKETPLACE_DIR, { recursive: true })
    }

    for (const file of PLUGIN_FILES) {
      const fullPath = join(MARKETPLACE_DIR, file.path)
      mkdirSync(dirname(fullPath), { recursive: true })
      writeFileSync(fullPath, file.content, 'utf-8')
    }
    log('✓ Created plugin files at ' + MARKETPLACE_DIR)

    // 2. Add marketplace (remove first if exists to ensure clean state)
    runClaude(['plugin', 'marketplace', 'remove', MARKETPLACE_NAME]) // Ignore errors

    const addResult = runClaude(['plugin', 'marketplace', 'add', MARKETPLACE_DIR])
    if (!addResult.success) {
      throw new Error('Failed to add marketplace: ' + addResult.output)
    }
    log('✓ Registered marketplace')

    // 3. Install plugin
    const installResult = runClaude(['plugin', 'install', PLUGIN_ID, '--scope', 'user'])
    if (!installResult.success) {
      throw new Error('Failed to install plugin: ' + installResult.output)
    }
    log('✓ Installed plugin')

    // 4. Clean up legacy paths
    cleanupLegacyPaths(log)

    log('')
    log('Installation complete! Restart Claude Code to apply changes.')
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
    // 1. Uninstall plugin (ignore errors - plugin might not be installed)
    runClaude(['plugin', 'uninstall', PLUGIN_ID])
    console.log('✓ Uninstalled plugin')

    // 2. Remove marketplace (ignore errors - marketplace might not exist)
    runClaude(['plugin', 'marketplace', 'remove', MARKETPLACE_NAME])
    console.log('✓ Removed marketplace')

    // 3. Clean up plugin files
    if (existsSync(MARKETPLACE_DIR)) {
      rmSync(MARKETPLACE_DIR, { recursive: true })
      console.log('✓ Removed plugin files from ' + MARKETPLACE_DIR)
    }

    // 4. Clean up legacy paths
    cleanupLegacyPaths(console.log)

    console.log('')
    console.log('Uninstall complete! Restart Claude Code to apply changes.')
  } catch (err) {
    throw new CliError(
      'UNINSTALL_FAILED',
      `Failed to uninstall Claude plugin: ${err instanceof Error ? err.message : String(err)}`,
      ExitCodes.ERROR
    )
  }
}

function cleanupLegacyPaths(log: (msg: string) => void): void {
  const legacyPaths = [LEGACY_PLUGIN_DIR, LEGACY_CACHE_DIR]

  for (const path of legacyPaths) {
    if (existsSync(path)) {
      rmSync(path, { recursive: true })
      log('✓ Removed legacy files from ' + path)
    }
  }
}

// ============================================================================
// Command Definitions
// ============================================================================

const claudeInstallCommand = defineCommand({
  meta: { name: 'install', description: 'Install Claude Code plugin' },
  args: globalArgs,
  async run() {
    await handleClaudeCommand('install')
  },
})

const claudeUninstallCommand = defineCommand({
  meta: { name: 'uninstall', description: 'Uninstall Claude Code plugin' },
  args: globalArgs,
  async run() {
    await handleClaudeCommand('uninstall')
  },
})

export const claudeCommand = defineCommand({
  meta: { name: 'claude', description: 'Claude Code integration' },
  subCommands: {
    install: claudeInstallCommand,
    uninstall: claudeUninstallCommand,
  },
})
