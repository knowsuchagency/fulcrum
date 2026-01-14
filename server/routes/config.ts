import { Hono } from 'hono'
import os from 'node:os'
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
  syncClaudeCodeTheme,
  isDeveloperMode,
  getDefaultValue,
  CLAUDE_CODE_THEMES,
  type NotificationSettings,
  type ZAiSettings,
  type EditorApp,
  type ClaudeCodeTheme,
} from '../lib/settings'
import { spawn } from 'child_process'
import { testNotificationChannel, sendNotification, type NotificationPayload } from '../services/notification-service'

// Config keys using dot-notation for nested settings
export const CONFIG_KEYS = {
  PORT: 'server.port',
  DEFAULT_GIT_REPOS_DIR: 'paths.defaultGitReposDir',
  REMOTE_HOST: 'remoteVibora.host',
  REMOTE_PORT: 'remoteVibora.port',
  EDITOR_APP: 'editor.app',
  EDITOR_HOST: 'editor.host',
  EDITOR_SSH_PORT: 'editor.sshPort',
  LINEAR_API_KEY: 'integrations.linearApiKey',
  GITHUB_PAT: 'integrations.githubPat',
  DEFAULT_AGENT: 'agent.defaultAgent',
  OPENCODE_MODEL: 'agent.opencodeModel',
  OPENCODE_DEFAULT_AGENT: 'agent.opencodeDefaultAgent',
  OPENCODE_PLAN_AGENT: 'agent.opencodePlanAgent',
  LANGUAGE: 'appearance.language',
  THEME: 'appearance.theme',
  SYNC_CLAUDE_CODE_THEME: 'appearance.syncClaudeCodeTheme',
  CLAUDE_CODE_LIGHT_THEME: 'appearance.claudeCodeLightTheme',
  CLAUDE_CODE_DARK_THEME: 'appearance.claudeCodeDarkTheme',
} as const

// Legacy key mapping to new nested paths (for backward compatibility)
const LEGACY_KEY_MAP: Record<string, string> = {
  // snake_case legacy keys
  port: 'server.port',
  default_git_repos_dir: 'paths.defaultGitReposDir',
  remote_host: 'remoteVibora.host',
  hostname: 'remoteVibora.host', // Extra legacy key
  ssh_port: 'editor.sshPort',
  linear_api_key: 'integrations.linearApiKey',
  github_pat: 'integrations.githubPat',
  language: 'appearance.language',
  theme: 'appearance.theme',
  // camelCase legacy keys
  defaultGitReposDir: 'paths.defaultGitReposDir',
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

// GET /api/config - List all config values
app.get('/', (c) => {
  const config: Record<string, unknown> = {}
  for (const [, path] of Object.entries(CONFIG_KEYS)) {
    const value = getSettingValue(path)
    config[path] = value ?? getDefaultValue(path)
  }
  return c.json(config)
})

// Notification routes must come before generic /:key routes

// GET /api/config/notifications - Get notification settings
app.get('/notifications', (c) => {
  const notifications = getNotificationSettings()
  return c.json(notifications)
})

// PUT /api/config/notifications - Update notification settings
// Supports optimistic locking via _updatedAt field to prevent stale tabs from overwriting
app.put('/notifications', async (c) => {
  try {
    const body = await c.req.json<Partial<NotificationSettings> & { _updatedAt?: number }>()
    const { _updatedAt, ...updates } = body

    const result = updateNotificationSettings(updates, _updatedAt)

    // Check if this is a conflict response
    if ('conflict' in result && result.conflict) {
      return c.json(
        {
          error: 'Settings changed by another client',
          current: result.current,
        },
        409
      )
    }

    return c.json(result)
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
// The systemd service handles build, migrations, and startup
app.post('/restart', (c) => {
  if (!isDeveloperMode()) {
    return c.json({ error: 'Restart only available in developer mode' }, 403)
  }

  // systemctl restart triggers the service which handles build + migrate + start
  setTimeout(() => {
    spawn('systemctl', ['--user', 'restart', 'vibora'], {
      detached: true,
      stdio: 'ignore',
    }).unref()
  }, 100)

  return c.json({ success: true, message: 'Restart initiated' })
})

// POST /api/config/sync-theme - Sync theme to Claude Code config
// Debounce to prevent rapid repeated syncs from multiple tabs
let lastSyncedTheme: { theme: 'light' | 'dark'; timestamp: number } | null = null
const SYNC_DEBOUNCE_MS = 1000

app.post('/sync-claude-theme', async (c) => {
  try {
    const body = await c.req.json<{ resolvedTheme: 'light' | 'dark' }>()
    const { resolvedTheme } = body

    if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') {
      return c.json({ error: 'resolvedTheme must be "light" or "dark"' }, 400)
    }

    // Skip if same theme was synced recently (defense against multiple tabs)
    const now = Date.now()
    if (lastSyncedTheme &&
        lastSyncedTheme.theme === resolvedTheme &&
        now - lastSyncedTheme.timestamp < SYNC_DEBOUNCE_MS) {
      return c.json({ success: true, resolvedTheme, skipped: true })
    }

    syncClaudeCodeTheme(resolvedTheme)
    lastSyncedTheme = { theme: resolvedTheme, timestamp: now }

    return c.json({ success: true, resolvedTheme })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to sync theme' }, 400)
  }
})

// GET /api/config/:key - Get config value
app.get('/:key', (c) => {
  const key = c.req.param('key')

  // Handle special read-only keys
  if (key === 'worktree_base_path') {
    return c.json({ key, value: getWorktreeBasePath(), isDefault: true })
  }
  if (key === 'home_dir') {
    return c.json({ key, value: os.homedir(), isDefault: true })
  }

  // Resolve key to nested path
  const path = resolveConfigKey(key)
  if (!path) {
    return c.json({ key, value: null, isDefault: true, error: 'Unknown config key' }, 404)
  }

  const value = getSettingValue(path)
  const defaultValue = getDefaultValue(path)
  const isDefault = value === defaultValue || value === undefined || value === null

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
    } else if (path === CONFIG_KEYS.THEME) {
      if (value !== null && value !== '' && value !== 'system' && value !== 'light' && value !== 'dark') {
        return c.json({ error: 'Theme must be "system", "light", "dark", or null' }, 400)
      }
      value = value === '' || value === 'system' ? null : value
    } else if (path === CONFIG_KEYS.SYNC_CLAUDE_CODE_THEME) {
      if (typeof value !== 'boolean') {
        return c.json({ error: 'Sync setting must be a boolean' }, 400)
      }
    } else if (path === CONFIG_KEYS.CLAUDE_CODE_LIGHT_THEME || path === CONFIG_KEYS.CLAUDE_CODE_DARK_THEME) {
      if (!CLAUDE_CODE_THEMES.includes(value as ClaudeCodeTheme)) {
        return c.json({ error: `Claude Code theme must be one of: ${CLAUDE_CODE_THEMES.join(', ')}` }, 400)
      }
    } else if (path === CONFIG_KEYS.EDITOR_APP) {
      const validApps: EditorApp[] = ['vscode', 'cursor', 'windsurf', 'zed', 'antigravity']
      if (!validApps.includes(value as EditorApp)) {
        return c.json({ error: `Editor app must be one of: ${validApps.join(', ')}` }, 400)
      }
    } else if (path === CONFIG_KEYS.DEFAULT_AGENT) {
      const validAgents = ['claude', 'opencode']
      if (!validAgents.includes(value as string)) {
        return c.json({ error: `Default agent must be one of: ${validAgents.join(', ')}` }, 400)
      }
    } else if (path === CONFIG_KEYS.OPENCODE_MODEL) {
      // OpenCode model can be null or a string like "anthropic/claude-opus-4-5"
      if (value !== null && typeof value !== 'string') {
        return c.json({ error: 'OpenCode model must be a string or null' }, 400)
      }
      // Convert empty string to null
      if (value === '') {
        value = null
      }
    } else if (path === CONFIG_KEYS.OPENCODE_DEFAULT_AGENT || path === CONFIG_KEYS.OPENCODE_PLAN_AGENT) {
      // OpenCode agent names must be non-empty strings
      if (typeof value !== 'string' || value.trim() === '') {
        return c.json({ error: 'OpenCode agent name must be a non-empty string' }, 400)
      }
      value = value.trim()
    } else if (typeof value === 'string' && value === '') {
      // Convert empty strings to null for nullable fields
      if (path === CONFIG_KEYS.LINEAR_API_KEY || path === CONFIG_KEYS.GITHUB_PAT ||
          path === CONFIG_KEYS.REMOTE_HOST || path === CONFIG_KEYS.EDITOR_HOST) {
        value = null
      }
    }

    updateSettingByPath(path, value)

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
