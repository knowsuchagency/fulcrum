import { Hono } from 'hono'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const app = new Hono()

/**
 * Check if a command is available in PATH
 */
function isCommandAvailable(command: string): { installed: boolean; path?: string } {
  try {
    const path = execSync(`which ${command}`, { encoding: 'utf-8' }).trim()
    return { installed: true, path }
  } catch {
    return { installed: false }
  }
}

/**
 * Check if Claude Code CLI is installed
 * Checks PATH first, then common installation locations
 */
function isClaudeCodeInstalled(): { installed: boolean; path?: string } {
  // First check PATH
  const pathCheck = isCommandAvailable('claude')
  if (pathCheck.installed) {
    return pathCheck
  }

  // Check common installation paths (e.g., when installed as alias)
  const commonPaths = [
    join(homedir(), '.claude', 'local', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ]

  for (const path of commonPaths) {
    if (existsSync(path)) {
      return { installed: true, path }
    }
  }

  return { installed: false }
}

/**
 * Check if OpenCode CLI is installed
 * Checks PATH first, then common installation locations
 */
function isOpenCodeInstalled(): { installed: boolean; path?: string } {
  const pathCheck = isCommandAvailable('opencode')
  if (pathCheck.installed) {
    return pathCheck
  }

  const commonPaths = [
    join(homedir(), '.opencode', 'bin', 'opencode'),
    join(homedir(), '.local', 'bin', 'opencode'),
    '/usr/local/bin/opencode',
    '/opt/homebrew/bin/opencode',
  ]

  for (const path of commonPaths) {
    if (existsSync(path)) {
      return { installed: true, path }
    }
  }

  return { installed: false }
}

/**
 * GET /api/system/dependencies
 * Returns the status of required and optional dependencies
 */
app.get('/dependencies', (c) => {
  // Check for Claude Code CLI
  // The CLI performs alias-aware detection before starting the server.
  // Since the server runs as a daemon without access to shell aliases,
  // we trust the CLI's detection passed via environment variable.
  // As a fallback, we also check common installation paths.
  const claudeInstalledFromEnv = process.env.FULCRUM_CLAUDE_INSTALLED === '1'
  const claudeMissingFromEnv = process.env.FULCRUM_CLAUDE_MISSING === '1'
  const claudeCheck = claudeInstalledFromEnv
    ? { installed: true }
    : claudeMissingFromEnv
      ? { installed: false }
      : isClaudeCodeInstalled()

  // Check for OpenCode CLI
  // Same pattern as Claude Code - trust CLI's alias-aware detection via env vars
  const openCodeInstalledFromEnv = process.env.FULCRUM_OPENCODE_INSTALLED === '1'
  const openCodeMissingFromEnv = process.env.FULCRUM_OPENCODE_MISSING === '1'
  const openCodeCheck = openCodeInstalledFromEnv
    ? { installed: true }
    : openCodeMissingFromEnv
      ? { installed: false }
      : isOpenCodeInstalled()

  // Check for dtach (should always be installed if we got here, but check anyway)
  const dtachCheck = isCommandAvailable('dtach')

  return c.json({
    claudeCode: claudeCheck,
    openCode: openCodeCheck,
    dtach: dtachCheck,
  })
})

export default app
