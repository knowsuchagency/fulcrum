import type { IncomingMessage, ServerResponse } from 'http'
import {
  getSettings,
  getSetting,
  updateSettings,
  resetSettings,
  type Settings,
} from '../lib/settings'

// Config keys (mapped to settings keys)
export const CONFIG_KEYS = {
  WORKTREE_BASE_PATH: 'worktreeBasePath',
} as const

// Helper to send JSON response
function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

// Helper to send error
function error(res: ServerResponse, message: string, status = 400) {
  json(res, { error: message }, status)
}

// GET /api/config/:key - Get config value
export function getConfig(req: IncomingMessage, res: ServerResponse, key: string) {
  const settings = getSettings()

  // Map API keys to settings keys
  let value: string | null = null

  if (key === 'worktree_base_path' || key === CONFIG_KEYS.WORKTREE_BASE_PATH) {
    value = settings.worktreeBasePath
  }

  if (value === null) {
    return json(res, { key, value: null, isDefault: true })
  }

  json(res, { key, value, isDefault: false })
}

// PUT /api/config/:key - Set config value
export async function setConfig(req: IncomingMessage, res: ServerResponse, key: string) {
  try {
    const body = await parseBody<{ value: string }>(req)

    if (typeof body.value !== 'string') {
      return error(res, 'Value must be a string')
    }

    // Map API keys to settings keys and update
    if (key === 'worktree_base_path' || key === CONFIG_KEYS.WORKTREE_BASE_PATH) {
      updateSettings({ worktreeBasePath: body.value })
      json(res, { key, value: body.value })
    } else {
      error(res, `Unknown config key: ${key}`)
    }
  } catch (err) {
    error(res, err instanceof Error ? err.message : 'Failed to set config')
  }
}

// DELETE /api/config/:key - Reset config to default
export function deleteConfig(req: IncomingMessage, res: ServerResponse, key: string) {
  // Reset all settings and return the default for the requested key
  const defaults = resetSettings()

  let defaultValue: string | null = null
  if (key === 'worktree_base_path' || key === CONFIG_KEYS.WORKTREE_BASE_PATH) {
    defaultValue = defaults.worktreeBasePath
  }

  json(res, { key, value: defaultValue, isDefault: true })
}

// Helper to parse JSON body
async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

// Export the default getter for use in other modules
export function getDefaultWorktreeBasePath(): string {
  return getSetting('worktreeBasePath')
}
