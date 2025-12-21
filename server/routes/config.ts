import { Hono } from 'hono'
import { getSettings, getSetting, updateSettings, resetSettings } from '../lib/settings'

// Config keys (mapped to settings keys)
export const CONFIG_KEYS = {
  PORT: 'port',
  DATABASE_PATH: 'databasePath',
  WORKTREE_BASE_PATH: 'worktreeBasePath',
  DEFAULT_GIT_REPOS_DIR: 'defaultGitReposDir',
  TASK_CREATION_COMMAND: 'taskCreationCommand',
  HOSTNAME: 'hostname',
  SSH_PORT: 'sshPort',
} as const

const app = new Hono()

// GET /api/config/:key - Get config value
app.get('/:key', (c) => {
  const key = c.req.param('key')
  const settings = getSettings()

  // Map API keys to settings keys
  let value: string | number | null = null

  if (key === 'port' || key === CONFIG_KEYS.PORT) {
    value = settings.port
  } else if (key === 'database_path' || key === CONFIG_KEYS.DATABASE_PATH) {
    value = settings.databasePath
  } else if (key === 'worktree_base_path' || key === CONFIG_KEYS.WORKTREE_BASE_PATH) {
    value = settings.worktreeBasePath
  } else if (key === 'default_git_repos_dir' || key === CONFIG_KEYS.DEFAULT_GIT_REPOS_DIR) {
    value = settings.defaultGitReposDir
  } else if (key === 'task_creation_command' || key === CONFIG_KEYS.TASK_CREATION_COMMAND) {
    value = settings.taskCreationCommand
  } else if (key === 'hostname' || key === CONFIG_KEYS.HOSTNAME) {
    value = settings.hostname
  } else if (key === 'ssh_port' || key === CONFIG_KEYS.SSH_PORT) {
    value = settings.sshPort
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
    const body = await c.req.json<{ value: string | number }>()

    // Map API keys to settings keys and update
    if (key === 'port' || key === CONFIG_KEYS.PORT) {
      const port = typeof body.value === 'number' ? body.value : parseInt(body.value, 10)
      if (isNaN(port) || port < 1 || port > 65535) {
        return c.json({ error: 'Port must be a number between 1 and 65535' }, 400)
      }
      updateSettings({ port })
      return c.json({ key, value: port })
    } else if (key === 'database_path' || key === CONFIG_KEYS.DATABASE_PATH) {
      if (typeof body.value !== 'string') {
        return c.json({ error: 'Value must be a string' }, 400)
      }
      updateSettings({ databasePath: body.value })
      return c.json({ key, value: body.value })
    } else if (key === 'worktree_base_path' || key === CONFIG_KEYS.WORKTREE_BASE_PATH) {
      if (typeof body.value !== 'string') {
        return c.json({ error: 'Value must be a string' }, 400)
      }
      updateSettings({ worktreeBasePath: body.value })
      return c.json({ key, value: body.value })
    } else if (key === 'default_git_repos_dir' || key === CONFIG_KEYS.DEFAULT_GIT_REPOS_DIR) {
      if (typeof body.value !== 'string') {
        return c.json({ error: 'Value must be a string' }, 400)
      }
      updateSettings({ defaultGitReposDir: body.value })
      return c.json({ key, value: body.value })
    } else if (key === 'task_creation_command' || key === CONFIG_KEYS.TASK_CREATION_COMMAND) {
      if (typeof body.value !== 'string') {
        return c.json({ error: 'Value must be a string' }, 400)
      }
      updateSettings({ taskCreationCommand: body.value })
      return c.json({ key, value: body.value })
    } else if (key === 'hostname' || key === CONFIG_KEYS.HOSTNAME) {
      if (typeof body.value !== 'string') {
        return c.json({ error: 'Value must be a string' }, 400)
      }
      updateSettings({ hostname: body.value })
      return c.json({ key, value: body.value })
    } else if (key === 'ssh_port' || key === CONFIG_KEYS.SSH_PORT) {
      const sshPort = typeof body.value === 'number' ? body.value : parseInt(body.value, 10)
      if (isNaN(sshPort) || sshPort < 1 || sshPort > 65535) {
        return c.json({ error: 'SSH port must be a number between 1 and 65535' }, 400)
      }
      updateSettings({ sshPort })
      return c.json({ key, value: sshPort })
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

  let defaultValue: string | number | null = null
  if (key === 'port' || key === CONFIG_KEYS.PORT) {
    defaultValue = defaults.port
  } else if (key === 'database_path' || key === CONFIG_KEYS.DATABASE_PATH) {
    defaultValue = defaults.databasePath
  } else if (key === 'worktree_base_path' || key === CONFIG_KEYS.WORKTREE_BASE_PATH) {
    defaultValue = defaults.worktreeBasePath
  } else if (key === 'default_git_repos_dir' || key === CONFIG_KEYS.DEFAULT_GIT_REPOS_DIR) {
    defaultValue = defaults.defaultGitReposDir
  } else if (key === 'task_creation_command' || key === CONFIG_KEYS.TASK_CREATION_COMMAND) {
    defaultValue = defaults.taskCreationCommand
  } else if (key === 'hostname' || key === CONFIG_KEYS.HOSTNAME) {
    defaultValue = defaults.hostname
  } else if (key === 'ssh_port' || key === CONFIG_KEYS.SSH_PORT) {
    defaultValue = defaults.sshPort
  }

  return c.json({ key, value: defaultValue, isDefault: true })
})

// Export the default getter for use in other modules
export function getDefaultWorktreeBasePath(): string {
  return getSetting('worktreeBasePath')
}

export default app
