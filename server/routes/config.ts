import { Hono } from 'hono'
import { getSettings, getSetting, updateSettings, resetSettings } from '../lib/settings'

// Config keys (mapped to settings keys)
export const CONFIG_KEYS = {
  WORKTREE_BASE_PATH: 'worktreeBasePath',
} as const

const app = new Hono()

// GET /api/config/:key - Get config value
app.get('/:key', (c) => {
  const key = c.req.param('key')
  const settings = getSettings()

  // Map API keys to settings keys
  let value: string | null = null

  if (key === 'worktree_base_path' || key === CONFIG_KEYS.WORKTREE_BASE_PATH) {
    value = settings.worktreeBasePath
  }

  if (value === null) {
    return c.json({ key, value: null, isDefault: true })
  }

  return c.json({ key, value, isDefault: false })
})

// PUT /api/config/:key - Set config value
app.put('/:key', async (c) => {
  const key = c.req.param('key')

  try {
    const body = await c.req.json<{ value: string }>()

    if (typeof body.value !== 'string') {
      return c.json({ error: 'Value must be a string' }, 400)
    }

    // Map API keys to settings keys and update
    if (key === 'worktree_base_path' || key === CONFIG_KEYS.WORKTREE_BASE_PATH) {
      updateSettings({ worktreeBasePath: body.value })
      return c.json({ key, value: body.value })
    } else {
      return c.json({ error: `Unknown config key: ${key}` }, 400)
    }
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to set config' }, 400)
  }
})

// DELETE /api/config/:key - Reset config to default
app.delete('/:key', (c) => {
  const key = c.req.param('key')

  // Reset all settings and return the default for the requested key
  const defaults = resetSettings()

  let defaultValue: string | null = null
  if (key === 'worktree_base_path' || key === CONFIG_KEYS.WORKTREE_BASE_PATH) {
    defaultValue = defaults.worktreeBasePath
  }

  return c.json({ key, value: defaultValue, isDefault: true })
})

// Export the default getter for use in other modules
export function getDefaultWorktreeBasePath(): string {
  return getSetting('worktreeBasePath')
}

export default app
