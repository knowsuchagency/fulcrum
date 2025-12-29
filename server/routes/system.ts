import { Hono } from 'hono'
import { execSync } from 'node:child_process'

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
 * GET /api/system/dependencies
 * Returns the status of required and optional dependencies
 */
app.get('/dependencies', (c) => {
  // Check for Claude Code CLI
  // First check environment variable (set by launcher), then do live check
  const claudeMissingFromEnv = process.env.VIBORA_CLAUDE_MISSING === '1'
  const claudeCheck = claudeMissingFromEnv
    ? { installed: false }
    : isCommandAvailable('claude')

  // Check for dtach (should always be installed if we got here, but check anyway)
  const dtachCheck = isCommandAvailable('dtach')

  return c.json({
    claudeCode: claudeCheck,
    dtach: dtachCheck,
  })
})

export default app
