import { Hono } from 'hono'
import {
  getSettings,
  updateSettings,
  resetSettings,
  getWorktreeBasePath,
  getNotificationSettings,
  updateNotificationSettings,
  getZAiSettings,
  updateZAiSettings,
  getClaudeSettings,
  updateClaudeSettings,
  type NotificationSettings,
  type ZAiSettings,
} from '../lib/settings'
import { testNotificationChannel } from '../services/notification-service'

// Config keys (mapped to settings keys)
export const CONFIG_KEYS = {
  PORT: 'port',
  DEFAULT_GIT_REPOS_DIR: 'defaultGitReposDir',
  TASK_CREATION_COMMAND: 'taskCreationCommand',
  HOSTNAME: 'hostname',
  SSH_PORT: 'sshPort',
  LINEAR_API_KEY: 'linearApiKey',
  GITHUB_PAT: 'githubPat',
  LANGUAGE: 'language',
} as const

const app = new Hono()

// Notification routes must come before generic /:key routes

// GET /api/config/notifications - Get notification settings
app.get('/notifications', (c) => {
  const notifications = getNotificationSettings()
  return c.json(notifications)
})

// PUT /api/config/notifications - Update notification settings
app.put('/notifications', async (c) => {
  try {
    const body = await c.req.json<Partial<NotificationSettings>>()
    const updated = updateNotificationSettings(body)
    return c.json(updated)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to update notifications' }, 400)
  }
})

// POST /api/config/notifications/test/:channel - Test a notification channel
app.post('/notifications/test/:channel', async (c) => {
  const channel = c.req.param('channel') as 'sound' | 'slack' | 'discord' | 'pushover'
  const validChannels = ['sound', 'slack', 'discord', 'pushover']

  if (!validChannels.includes(channel)) {
    return c.json({ error: `Invalid channel: ${channel}` }, 400)
  }

  const result = await testNotificationChannel(channel)
  return c.json(result)
})

// z.ai routes must come before generic /:key routes

// GET /api/config/z-ai - Get z.ai settings
app.get('/z-ai', (c) => {
  const settings = getZAiSettings()
  return c.json(settings)
})

// PUT /api/config/z-ai - Update z.ai settings (also updates ~/.claude/settings.json)
app.put('/z-ai', async (c) => {
  try {
    const body = await c.req.json<Partial<ZAiSettings>>()
    const updated = updateZAiSettings(body)

    // Sync to Claude Code settings
    if (updated.enabled && updated.apiKey) {
      // Get current Claude settings and merge env vars
      const claudeSettings = getClaudeSettings()
      const currentEnv = (claudeSettings.env as Record<string, string>) || {}
      updateClaudeSettings({
        env: {
          ...currentEnv,
          ANTHROPIC_AUTH_TOKEN: updated.apiKey,
          ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic',
          API_TIMEOUT_MS: '3000000',
          // Model mappings for z.ai (configurable)
          ANTHROPIC_DEFAULT_HAIKU_MODEL: updated.haikuModel,
          ANTHROPIC_DEFAULT_SONNET_MODEL: updated.sonnetModel,
          ANTHROPIC_DEFAULT_OPUS_MODEL: updated.opusModel,
        },
      })
    } else {
      // Remove z.ai env vars when disabled (preserve other env vars)
      const claudeSettings = getClaudeSettings()
      if (claudeSettings.env) {
        const env = { ...(claudeSettings.env as Record<string, string>) }
        delete env.ANTHROPIC_AUTH_TOKEN
        delete env.ANTHROPIC_BASE_URL
        delete env.API_TIMEOUT_MS
        delete env.ANTHROPIC_DEFAULT_HAIKU_MODEL
        delete env.ANTHROPIC_DEFAULT_SONNET_MODEL
        delete env.ANTHROPIC_DEFAULT_OPUS_MODEL
        updateClaudeSettings({ env: Object.keys(env).length > 0 ? env : undefined })
      }
    }

    return c.json(updated)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to update z.ai settings' }, 400)
  }
})

// GET /api/config/:key - Get config value
app.get('/:key', (c) => {
  const key = c.req.param('key')
  const settings = getSettings()

  // Map API keys to settings keys
  let value: string | number | null = null

  if (key === 'port' || key === CONFIG_KEYS.PORT) {
    value = settings.port
  } else if (key === 'default_git_repos_dir' || key === CONFIG_KEYS.DEFAULT_GIT_REPOS_DIR) {
    value = settings.defaultGitReposDir
  } else if (key === 'task_creation_command' || key === CONFIG_KEYS.TASK_CREATION_COMMAND) {
    value = settings.taskCreationCommand
  } else if (key === 'hostname' || key === CONFIG_KEYS.HOSTNAME) {
    value = settings.hostname
  } else if (key === 'ssh_port' || key === CONFIG_KEYS.SSH_PORT) {
    value = settings.sshPort
  } else if (key === 'linear_api_key' || key === CONFIG_KEYS.LINEAR_API_KEY) {
    value = settings.linearApiKey
  } else if (key === 'github_pat' || key === CONFIG_KEYS.GITHUB_PAT) {
    value = settings.githubPat
  } else if (key === 'language' || key === CONFIG_KEYS.LANGUAGE) {
    return c.json({ key, value: settings.language, isDefault: settings.language === null })
  } else if (key === 'worktree_base_path') {
    // Read-only: derived from VIBORA_DIR
    return c.json({ key, value: getWorktreeBasePath(), isDefault: true })
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
    } else if (key === 'linear_api_key' || key === CONFIG_KEYS.LINEAR_API_KEY) {
      if (typeof body.value !== 'string') {
        return c.json({ error: 'Value must be a string' }, 400)
      }
      updateSettings({ linearApiKey: body.value || null })
      return c.json({ key, value: body.value })
    } else if (key === 'github_pat' || key === CONFIG_KEYS.GITHUB_PAT) {
      if (typeof body.value !== 'string') {
        return c.json({ error: 'Value must be a string' }, 400)
      }
      updateSettings({ githubPat: body.value || null })
      return c.json({ key, value: body.value })
    } else if (key === 'language' || key === CONFIG_KEYS.LANGUAGE) {
      const langValue = body.value === '' || body.value === null ? null : body.value
      if (langValue !== null && langValue !== 'en' && langValue !== 'zh') {
        return c.json({ error: 'Language must be "en", "zh", or null' }, 400)
      }
      updateSettings({ language: langValue as 'en' | 'zh' | null })
      return c.json({ key, value: langValue })
    } else {
      return c.json({ error: `Unknown or read-only config key: ${key}` }, 400)
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
  } else if (key === 'default_git_repos_dir' || key === CONFIG_KEYS.DEFAULT_GIT_REPOS_DIR) {
    defaultValue = defaults.defaultGitReposDir
  } else if (key === 'task_creation_command' || key === CONFIG_KEYS.TASK_CREATION_COMMAND) {
    defaultValue = defaults.taskCreationCommand
  } else if (key === 'hostname' || key === CONFIG_KEYS.HOSTNAME) {
    defaultValue = defaults.hostname
  } else if (key === 'ssh_port' || key === CONFIG_KEYS.SSH_PORT) {
    defaultValue = defaults.sshPort
  } else if (key === 'linear_api_key' || key === CONFIG_KEYS.LINEAR_API_KEY) {
    defaultValue = defaults.linearApiKey
  } else if (key === 'github_pat' || key === CONFIG_KEYS.GITHUB_PAT) {
    defaultValue = defaults.githubPat
  } else if (key === 'language' || key === CONFIG_KEYS.LANGUAGE) {
    defaultValue = defaults.language
  }

  return c.json({ key, value: defaultValue, isDefault: true })
})

export default app
