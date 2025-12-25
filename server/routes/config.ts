import { Hono } from 'hono'
import {
  getSettings,
  updateSettingByPath,
  getWorktreeBasePath,
  getNotificationSettings,
  updateNotificationSettings,
  getZAiSettings,
  updateZAiSettings,
  getClaudeSettings,
  updateClaudeSettings,
  isDeveloperMode,
  getDefaultValue,
  type NotificationSettings,
  type ZAiSettings,
  type EditorApp,
} from '../lib/settings'
import { spawn } from 'child_process'
import { testNotificationChannel, sendNotification, type NotificationPayload } from '../services/notification-service'

// Config keys using dot-notation for nested settings
export const CONFIG_KEYS = {
  PORT: 'server.port',
  DEFAULT_GIT_REPOS_DIR: 'paths.defaultGitReposDir',
  BASIC_AUTH_USERNAME: 'authentication.username',
  BASIC_AUTH_PASSWORD: 'authentication.password',
  REMOTE_HOST: 'remoteVibora.host',
  REMOTE_PORT: 'remoteVibora.port',
  EDITOR_APP: 'editor.app',
  EDITOR_HOST: 'editor.host',
  EDITOR_SSH_PORT: 'editor.sshPort',
  LINEAR_API_KEY: 'integrations.linearApiKey',
  GITHUB_PAT: 'integrations.githubPat',
  LANGUAGE: 'appearance.language',
} as const

// Legacy key mapping to new nested paths (for backward compatibility)
const LEGACY_KEY_MAP: Record<string, string> = {
  // snake_case legacy keys
  port: 'server.port',
  default_git_repos_dir: 'paths.defaultGitReposDir',
  basic_auth_username: 'authentication.username',
  basic_auth_password: 'authentication.password',
  remote_host: 'remoteVibora.host',
  hostname: 'remoteVibora.host', // Extra legacy key
  ssh_port: 'editor.sshPort',
  linear_api_key: 'integrations.linearApiKey',
  github_pat: 'integrations.githubPat',
  language: 'appearance.language',
  // camelCase legacy keys
  defaultGitReposDir: 'paths.defaultGitReposDir',
  basicAuthUsername: 'authentication.username',
  basicAuthPassword: 'authentication.password',
  remoteHost: 'remoteVibora.host',
  sshPort: 'editor.sshPort',
  linearApiKey: 'integrations.linearApiKey',
  githubPat: 'integrations.githubPat',
}

// Valid nested paths
const VALID_PATHS = new Set(Object.values(CONFIG_KEYS))

// Resolve a key to its nested path
function resolveConfigKey(key: string): string | null {
  // If it's already a valid dot-notation path, return it
  if (VALID_PATHS.has(key as (typeof CONFIG_KEYS)[keyof typeof CONFIG_KEYS])) {
    return key
  }

  // Check legacy key map
  if (key in LEGACY_KEY_MAP) {
    return LEGACY_KEY_MAP[key]
  }

  return null
}

// Get value from nested settings by path
function getSettingValue(path: string): unknown {
  const settings = getSettings()
  const parts = path.split('.')

  let current: unknown = settings
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return current
}

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

// POST /api/config/notifications/send - Send an arbitrary notification
app.post('/notifications/send', async (c) => {
  try {
    const body = await c.req.json<{ title: string; message: string }>()

    if (!body.title || !body.message) {
      return c.json({ error: 'title and message are required' }, 400)
    }

    const payload: NotificationPayload = {
      title: body.title,
      message: body.message,
      type: 'task_status_change', // Generic type for arbitrary notifications
    }

    const results = await sendNotification(payload)
    return c.json({ success: true, results })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to send notification' }, 400)
  }
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

// Developer mode routes

// GET /api/config/developer-mode - Check if developer mode is enabled
// Track when the server started for restart detection
const serverStartTime = Date.now()

app.get('/developer-mode', (c) => {
  return c.json({ enabled: isDeveloperMode(), startedAt: serverStartTime })
})

// POST /api/config/restart - Restart Vibora via systemd (developer mode only)
// Build first, then restart only if build succeeds
app.post('/restart', (c) => {
  if (!isDeveloperMode()) {
    return c.json({ error: 'Restart only available in developer mode' }, 403)
  }

  // Build first in the background, then restart only if successful
  // This prevents stopping the old instance if build fails
  setTimeout(() => {
    spawn('bash', ['-c', 'cd ~/projects/vibora && mise run build && bun run drizzle-kit push && systemctl --user restart vibora-dev'], {
      detached: true,
      stdio: 'ignore',
    }).unref()
  }, 100)

  return c.json({ success: true, message: 'Restart initiated (build + migrate + restart)' })
})

// GET /api/config/:key - Get config value
app.get('/:key', (c) => {
  const key = c.req.param('key')

  // Handle special read-only keys
  if (key === 'worktree_base_path') {
    return c.json({ key, value: getWorktreeBasePath(), isDefault: true })
  }

  // Resolve key to nested path
  const path = resolveConfigKey(key)
  if (!path) {
    return c.json({ key, value: null, isDefault: true, error: 'Unknown config key' }, 404)
  }

  const value = getSettingValue(path)
  const defaultValue = getDefaultValue(path)
  const isDefault = value === defaultValue || value === undefined || value === null

  // Mask password for security
  if (path === CONFIG_KEYS.BASIC_AUTH_PASSWORD) {
    return c.json({
      key,
      value: value ? '••••••••' : null,
      isDefault: value === null || value === undefined,
    })
  }

  return c.json({ key, value: value ?? defaultValue, isDefault })
})

// PUT /api/config/:key - Set config value
app.put('/:key', async (c) => {
  const key = c.req.param('key')

  // Resolve key to nested path
  const path = resolveConfigKey(key)
  if (!path) {
    return c.json({ error: `Unknown or read-only config key: ${key}` }, 400)
  }

  try {
    const body = await c.req.json<{ value: string | number | null }>()
    let { value } = body

    // Validate based on the setting type
    if (path === CONFIG_KEYS.PORT || path === CONFIG_KEYS.REMOTE_PORT || path === CONFIG_KEYS.EDITOR_SSH_PORT) {
      const port = typeof value === 'number' ? value : parseInt(value as string, 10)
      if (isNaN(port) || port < 1 || port > 65535) {
        return c.json({ error: 'Port must be a number between 1 and 65535' }, 400)
      }
      value = port
    } else if (path === CONFIG_KEYS.LANGUAGE) {
      if (value !== null && value !== '' && value !== 'en' && value !== 'zh') {
        return c.json({ error: 'Language must be "en", "zh", or null' }, 400)
      }
      value = value === '' ? null : value
    } else if (path === CONFIG_KEYS.EDITOR_APP) {
      const validApps: EditorApp[] = ['vscode', 'cursor', 'windsurf', 'zed']
      if (!validApps.includes(value as EditorApp)) {
        return c.json({ error: `Editor app must be one of: ${validApps.join(', ')}` }, 400)
      }
    } else if (typeof value === 'string' && value === '') {
      // Convert empty strings to null for nullable fields
      if (path === CONFIG_KEYS.LINEAR_API_KEY || path === CONFIG_KEYS.GITHUB_PAT ||
          path === CONFIG_KEYS.BASIC_AUTH_USERNAME || path === CONFIG_KEYS.BASIC_AUTH_PASSWORD ||
          path === CONFIG_KEYS.REMOTE_HOST || path === CONFIG_KEYS.EDITOR_HOST) {
        value = null
      }
    }

    updateSettingByPath(path, value)

    // Mask password in response
    if (path === CONFIG_KEYS.BASIC_AUTH_PASSWORD) {
      return c.json({ key, value: value ? '••••••••' : null })
    }

    return c.json({ key, value })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to set config' }, 400)
  }
})

// DELETE /api/config/:key - Reset config to default
app.delete('/:key', (c) => {
  const key = c.req.param('key')

  // Resolve key to nested path
  const path = resolveConfigKey(key)
  if (!path) {
    return c.json({ error: `Unknown config key: ${key}` }, 400)
  }

  // Get the default value for this specific key
  const defaultValue = getDefaultValue(path)

  // Update the setting to its default value
  updateSettingByPath(path, defaultValue)

  return c.json({ key, value: defaultValue, isDefault: true })
})

export default app
