import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  unlinkSync,
  copyFileSync,
  renameSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CliError, ExitCodes } from '../utils/errors'
// @ts-expect-error - Bun text import
import PLUGIN_CODE from '../../../plugins/fulcrum-opencode/index.ts' with { type: 'text' }

// OpenCode config: ~/.opencode/opencode.json (global/root level)
const OPENCODE_DIR = join(homedir(), '.opencode')
const OPENCODE_CONFIG_PATH = join(OPENCODE_DIR, 'opencode.json')

// Plugin location: ~/.config/opencode/plugin/fulcrum.ts
const PLUGIN_DIR = join(homedir(), '.config', 'opencode', 'plugin')
const PLUGIN_PATH = join(PLUGIN_DIR, 'fulcrum.ts')

// MCP server config (OpenCode format: type local with command array)
const FULCRUM_MCP_CONFIG = {
  type: 'local',
  command: ['fulcrum', 'mcp'],
  enabled: true,
}

export async function handleOpenCodeCommand(action: string | undefined) {
  if (action === 'install') {
    await installOpenCodeIntegration()
    return
  }

  if (action === 'uninstall') {
    await uninstallOpenCodeIntegration()
    return
  }

  throw new CliError(
    'INVALID_ACTION',
    'Unknown action. Usage: fulcrum opencode install | fulcrum opencode uninstall',
    ExitCodes.INVALID_ARGS
  )
}

async function installOpenCodeIntegration() {
  try {
    // 1. Install plugin file (for status sync hooks)
    console.log('Installing OpenCode plugin...')
    mkdirSync(PLUGIN_DIR, { recursive: true })
    writeFileSync(PLUGIN_PATH, PLUGIN_CODE, 'utf-8')
    console.log('✓ Installed plugin at ' + PLUGIN_PATH)

    // 2. Configure MCP server (for task management tools)
    console.log('Configuring MCP server...')
    const mcpConfigured = addMcpServer()

    console.log('')
    if (mcpConfigured) {
      console.log('Installation complete! Restart OpenCode to apply changes.')
    } else {
      console.log('Plugin installed, but MCP configuration was skipped.')
      console.log('Please add the MCP server manually (see above).')
    }
  } catch (err) {
    throw new CliError(
      'INSTALL_FAILED',
      `Failed to install OpenCode integration: ${err instanceof Error ? err.message : String(err)}`,
      ExitCodes.ERROR
    )
  }
}

async function uninstallOpenCodeIntegration() {
  try {
    let removedPlugin = false
    let removedMcp = false

    // 1. Remove plugin file
    if (existsSync(PLUGIN_PATH)) {
      unlinkSync(PLUGIN_PATH)
      console.log('✓ Removed plugin from ' + PLUGIN_PATH)
      removedPlugin = true
    } else {
      console.log('• Plugin not found (already removed)')
    }

    // 2. Remove MCP server config
    removedMcp = removeMcpServer()

    if (!removedPlugin && !removedMcp) {
      console.log('Nothing to uninstall.')
    } else {
      console.log('')
      console.log('Uninstall complete! Restart OpenCode to apply changes.')
    }
  } catch (err) {
    throw new CliError(
      'UNINSTALL_FAILED',
      `Failed to uninstall OpenCode integration: ${err instanceof Error ? err.message : String(err)}`,
      ExitCodes.ERROR
    )
  }
}

/**
 * Safely extract mcp object from config, handling invalid types
 */
function getMcpObject(config: Record<string, unknown>): Record<string, unknown> {
  const mcp = config.mcp
  if (mcp && typeof mcp === 'object' && !Array.isArray(mcp)) {
    return mcp as Record<string, unknown>
  }
  return {}
}

/**
 * Add fulcrum MCP server to opencode.json
 * Non-destructive: preserves existing config, only adds fulcrum entry
 * Returns true if MCP was configured, false if skipped due to error
 */
function addMcpServer(): boolean {
  mkdirSync(OPENCODE_DIR, { recursive: true })

  let config: Record<string, unknown> = {}

  // Read existing config if present
  if (existsSync(OPENCODE_CONFIG_PATH)) {
    try {
      const content = readFileSync(OPENCODE_CONFIG_PATH, 'utf-8')
      config = JSON.parse(content)
    } catch {
      // If config is malformed, skip MCP setup and warn user
      console.log('⚠ Could not parse existing opencode.json, skipping MCP configuration')
      console.log('  Add manually to ~/.opencode/opencode.json:')
      console.log(
        '    "mcp": { "fulcrum": { "type": "local", "command": ["fulcrum", "mcp"], "enabled": true } }'
      )
      return false
    }
  }

  // Check if fulcrum MCP already exists - preserve existing config
  const mcp = getMcpObject(config)
  if (mcp.fulcrum) {
    console.log('• MCP server already configured, preserving existing configuration')
    return true
  }

  // Create backup before modifying
  if (existsSync(OPENCODE_CONFIG_PATH)) {
    copyFileSync(OPENCODE_CONFIG_PATH, OPENCODE_CONFIG_PATH + '.backup')
  }

  // Add fulcrum MCP server (non-destructive merge)
  config.mcp = {
    ...mcp,
    fulcrum: FULCRUM_MCP_CONFIG,
  }

  // Write safely: temp file then atomic rename
  const tempPath = OPENCODE_CONFIG_PATH + '.tmp'
  try {
    writeFileSync(tempPath, JSON.stringify(config, null, 2), 'utf-8')
    renameSync(tempPath, OPENCODE_CONFIG_PATH)
  } catch (error) {
    // Clean up temp file on failure to avoid leaving stale files behind
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath)
      }
    } catch {
      // Ignore cleanup errors; original error is more important
    }
    throw error
  }

  console.log('✓ Added MCP server to ' + OPENCODE_CONFIG_PATH)
  return true
}

/**
 * Remove fulcrum MCP server from opencode.json
 * Non-destructive: only removes fulcrum entry, preserves rest of config
 */
function removeMcpServer(): boolean {
  if (!existsSync(OPENCODE_CONFIG_PATH)) {
    console.log('• MCP config not found (already removed)')
    return false
  }

  let config: Record<string, unknown>
  try {
    const content = readFileSync(OPENCODE_CONFIG_PATH, 'utf-8')
    config = JSON.parse(content)
  } catch {
    console.log('⚠ Could not parse opencode.json, skipping MCP removal')
    return false
  }

  const mcp = getMcpObject(config)
  if (!mcp.fulcrum) {
    console.log('• MCP server not configured (already removed)')
    return false
  }

  // Create backup before modifying
  copyFileSync(OPENCODE_CONFIG_PATH, OPENCODE_CONFIG_PATH + '.backup')

  // Remove only the fulcrum entry
  delete mcp.fulcrum

  // If mcp object is now empty, remove it entirely
  if (Object.keys(mcp).length === 0) {
    delete config.mcp
  } else {
    config.mcp = mcp
  }

  // Write safely: temp file then atomic rename
  const tempPath = OPENCODE_CONFIG_PATH + '.tmp'
  try {
    writeFileSync(tempPath, JSON.stringify(config, null, 2), 'utf-8')
    renameSync(tempPath, OPENCODE_CONFIG_PATH)
  } catch (error) {
    // Clean up temp file on failure to avoid leaving stale files behind
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath)
      }
    } catch {
      // Ignore cleanup errors; original error is more important
    }
    throw error
  }

  console.log('✓ Removed MCP server from ' + OPENCODE_CONFIG_PATH)
  return true
}
