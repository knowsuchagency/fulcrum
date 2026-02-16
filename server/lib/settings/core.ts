import { log } from '../logger'
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  VALID_SETTING_PATHS,
  MIGRATION_MAP,
  type ClaudeCodeTheme,
  type EditorApp,
  type LegacySettings,
  type Settings,
  type AssistantProvider,
  type AssistantModel,
  type ChannelsSettings,
  type RitualConfig,
} from './types'
import type { AgentType } from '@shared/types'
import { ensureFulcrumDir, expandPath } from './paths'
import {
  getNestedValue,
} from './migration'
import { migrateSettingsJsonToFnox } from './migrate-to-fnox'
import {
  getFnoxValue,
  isFnoxAvailable,
  isSecretPath,
  setFnoxValue,
  FNOX_CONFIG_MAP,
} from './fnox'

// Get settings — reads all values from fnox cache with defaults fallback
// Precedence: env var > fnox > default
export function getSettings(): Settings {
  ensureFulcrumDir()

  const fv = (path: string): unknown => getFnoxValue(path)

  const settings: Settings = {
    _schemaVersion: CURRENT_SCHEMA_VERSION,
    server: {
      port: (fv('server.port') as number) ?? DEFAULT_SETTINGS.server.port,
    },
    paths: {
      defaultGitReposDir: expandPath(
        (fv('paths.defaultGitReposDir') as string) ?? DEFAULT_SETTINGS.paths.defaultGitReposDir
      ),
    },
    editor: {
      app: (fv('editor.app') as EditorApp) ?? DEFAULT_SETTINGS.editor.app,
      host: (fv('editor.host') as string) ?? DEFAULT_SETTINGS.editor.host,
      sshPort: (fv('editor.sshPort') as number) ?? DEFAULT_SETTINGS.editor.sshPort,
    },
    integrations: {
      githubPat: (fv('integrations.githubPat') as string | null) ?? null,
      cloudflareApiToken: (fv('integrations.cloudflareApiToken') as string | null) ?? null,
      cloudflareAccountId: (fv('integrations.cloudflareAccountId') as string | null) ?? null,
      googleClientId: (fv('integrations.googleClientId') as string | null) ?? null,
      googleClientSecret: (fv('integrations.googleClientSecret') as string | null) ?? null,
    },
    agent: {
      defaultAgent: (fv('agent.defaultAgent') as AgentType) ?? DEFAULT_SETTINGS.agent.defaultAgent,
      opencodeModel: (fv('agent.opencodeModel') as string | null) ?? null,
      opencodeDefaultAgent: (fv('agent.opencodeDefaultAgent') as string) ?? DEFAULT_SETTINGS.agent.opencodeDefaultAgent,
      opencodePlanAgent: (fv('agent.opencodePlanAgent') as string) ?? DEFAULT_SETTINGS.agent.opencodePlanAgent,
      autoScrollToBottom: (fv('agent.autoScrollToBottom') as boolean | null) ?? DEFAULT_SETTINGS.agent.autoScrollToBottom,
      claudeCodePath: (fv('agent.claudeCodePath') as string | null) ?? DEFAULT_SETTINGS.agent.claudeCodePath,
    },
    tasks: {
      defaultTaskType: (fv('tasks.defaultTaskType') as Settings['tasks']['defaultTaskType']) ?? DEFAULT_SETTINGS.tasks.defaultTaskType,
      startWorktreeTasksImmediately: (fv('tasks.startWorktreeTasksImmediately') as boolean | null) ?? DEFAULT_SETTINGS.tasks.startWorktreeTasksImmediately,
    },
    appearance: {
      language: (fv('appearance.language') as 'en' | 'zh' | null) ?? null,
      theme: (fv('appearance.theme') as 'system' | 'light' | 'dark' | null) ?? null,
      timezone: (fv('appearance.timezone') as string | null) ?? null,
      syncClaudeCodeTheme: (fv('appearance.syncClaudeCodeTheme') as boolean | null) ?? false,
      claudeCodeLightTheme: (fv('appearance.claudeCodeLightTheme') as ClaudeCodeTheme) ?? DEFAULT_SETTINGS.appearance.claudeCodeLightTheme,
      claudeCodeDarkTheme: (fv('appearance.claudeCodeDarkTheme') as ClaudeCodeTheme) ?? DEFAULT_SETTINGS.appearance.claudeCodeDarkTheme,
    },
    assistant: {
      provider: (fv('assistant.provider') as AssistantProvider) ?? DEFAULT_SETTINGS.assistant.provider,
      model: (fv('assistant.model') as AssistantModel) ?? DEFAULT_SETTINGS.assistant.model,
      observerModel: (fv('assistant.observerModel') as AssistantModel) ?? DEFAULT_SETTINGS.assistant.observerModel,
      observerProvider: (fv('assistant.observerProvider') as AssistantProvider | null) ?? DEFAULT_SETTINGS.assistant.observerProvider,
      observerOpencodeModel: (fv('assistant.observerOpencodeModel') as string | null) ?? DEFAULT_SETTINGS.assistant.observerOpencodeModel,
      customInstructions: (fv('assistant.customInstructions') as string | null) ?? null,
      documentsDir: expandPath(
        (fv('assistant.documentsDir') as string) ?? DEFAULT_SETTINGS.assistant.documentsDir
      ),
      ritualsEnabled: (fv('assistant.ritualsEnabled') as boolean | null) ?? DEFAULT_SETTINGS.assistant.ritualsEnabled,
      morningRitual: {
        time: (fv('assistant.morningRitual.time') as string) ?? DEFAULT_SETTINGS.assistant.morningRitual.time,
        prompt: (fv('assistant.morningRitual.prompt') as string) ?? DEFAULT_SETTINGS.assistant.morningRitual.prompt,
      } as RitualConfig,
      eveningRitual: {
        time: (fv('assistant.eveningRitual.time') as string) ?? DEFAULT_SETTINGS.assistant.eveningRitual.time,
        prompt: (fv('assistant.eveningRitual.prompt') as string) ?? DEFAULT_SETTINGS.assistant.eveningRitual.prompt,
      } as RitualConfig,
    },
    channels: {
      email: {
        enabled: (fv('channels.email.enabled') as boolean | null) ?? DEFAULT_SETTINGS.channels.email.enabled,
        backend: (fv('channels.email.backend') as ChannelsSettings['email']['backend']) ?? DEFAULT_SETTINGS.channels.email.backend,
        googleAccountId: (fv('channels.email.googleAccountId') as string | null) ?? DEFAULT_SETTINGS.channels.email.googleAccountId,
        imap: {
          host: (fv('channels.email.imap.host') as string) ?? DEFAULT_SETTINGS.channels.email.imap.host,
          port: (fv('channels.email.imap.port') as number) ?? DEFAULT_SETTINGS.channels.email.imap.port,
          secure: (fv('channels.email.imap.secure') as boolean | null) ?? DEFAULT_SETTINGS.channels.email.imap.secure,
          user: (fv('channels.email.imap.user') as string) ?? DEFAULT_SETTINGS.channels.email.imap.user,
          password: (fv('channels.email.imap.password') as string) ?? DEFAULT_SETTINGS.channels.email.imap.password,
        },
        pollIntervalSeconds: (fv('channels.email.pollIntervalSeconds') as number) ?? DEFAULT_SETTINGS.channels.email.pollIntervalSeconds,
      },
      slack: {
        enabled: (fv('channels.slack.enabled') as boolean | null) ?? DEFAULT_SETTINGS.channels.slack.enabled,
        botToken: (fv('channels.slack.botToken') as string) ?? DEFAULT_SETTINGS.channels.slack.botToken,
        appToken: (fv('channels.slack.appToken') as string) ?? DEFAULT_SETTINGS.channels.slack.appToken,
      },
      discord: {
        enabled: (fv('channels.discord.enabled') as boolean | null) ?? DEFAULT_SETTINGS.channels.discord.enabled,
        botToken: (fv('channels.discord.botToken') as string) ?? DEFAULT_SETTINGS.channels.discord.botToken,
      },
      telegram: {
        enabled: (fv('channels.telegram.enabled') as boolean | null) ?? DEFAULT_SETTINGS.channels.telegram.enabled,
        botToken: (fv('channels.telegram.botToken') as string) ?? DEFAULT_SETTINGS.channels.telegram.botToken,
      },
    },
    caldav: {
      enabled: (fv('caldav.enabled') as boolean | null) ?? DEFAULT_SETTINGS.caldav.enabled,
      syncIntervalMinutes: (fv('caldav.syncIntervalMinutes') as number) ?? DEFAULT_SETTINGS.caldav.syncIntervalMinutes,
      // Legacy fields — kept for type compat, defaults only
      serverUrl: DEFAULT_SETTINGS.caldav.serverUrl,
      username: DEFAULT_SETTINGS.caldav.username,
      password: DEFAULT_SETTINGS.caldav.password,
      authType: DEFAULT_SETTINGS.caldav.authType,
      googleClientId: DEFAULT_SETTINGS.caldav.googleClientId,
      googleClientSecret: DEFAULT_SETTINGS.caldav.googleClientSecret,
      oauthTokens: DEFAULT_SETTINGS.caldav.oauthTokens,
    },
  }

  // Apply environment variable overrides
  const portEnv = parseInt(process.env.PORT || '', 10)
  const editorSshPortEnv = parseInt(process.env.FULCRUM_SSH_PORT || '', 10)

  return {
    ...settings,
    server: {
      port: !isNaN(portEnv) && portEnv > 0 ? portEnv : settings.server.port,
    },
    paths: {
      defaultGitReposDir: process.env.FULCRUM_GIT_REPOS_DIR
        ? expandPath(process.env.FULCRUM_GIT_REPOS_DIR)
        : settings.paths.defaultGitReposDir,
    },
    editor: {
      app: settings.editor.app,
      host: process.env.FULCRUM_EDITOR_HOST ?? settings.editor.host,
      sshPort: !isNaN(editorSshPortEnv) && editorSshPortEnv > 0 ? editorSshPortEnv : settings.editor.sshPort,
    },
    integrations: {
      githubPat: process.env.GITHUB_PAT ?? settings.integrations.githubPat,
      cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN ?? settings.integrations.cloudflareApiToken,
      cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? settings.integrations.cloudflareAccountId,
      googleClientId: process.env.GOOGLE_CLIENT_ID ?? settings.integrations.googleClientId,
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? settings.integrations.googleClientSecret,
    },
    agent: settings.agent,
    tasks: settings.tasks,
    appearance: settings.appearance,
    assistant: settings.assistant,
    channels: settings.channels,
    caldav: settings.caldav,
  }
}

// Get a single setting value using dot notation path
export function getSetting(path: string): unknown {
  const settings = getSettings()
  return getNestedValue(settings as unknown as Record<string, unknown>, path)
}

// Get setting by legacy key name (for backward compatibility)
export function getSettingByKey<K extends keyof LegacySettings>(key: K): LegacySettings[K] {
  const settings = getSettings()
  const legacySettings = toLegacySettings(settings)
  return legacySettings[key]
}

// Convert nested settings to legacy flat format
export function toLegacySettings(settings: Settings): LegacySettings {
  return {
    port: settings.server.port,
    defaultGitReposDir: settings.paths.defaultGitReposDir,
    sshPort: settings.editor.sshPort,
    githubPat: settings.integrations.githubPat,
    language: settings.appearance.language,
    theme: settings.appearance.theme,
    syncClaudeCodeTheme: settings.appearance.syncClaudeCodeTheme,
    claudeCodeLightTheme: settings.appearance.claudeCodeLightTheme,
    claudeCodeDarkTheme: settings.appearance.claudeCodeDarkTheme,
  }
}

// Check if developer mode is enabled (FULCRUM_DEVELOPER env var)
export function isDeveloperMode(): boolean {
  return process.env.FULCRUM_DEVELOPER === '1' || process.env.FULCRUM_DEVELOPER === 'true'
}

// Update a setting by dot-notation path — writes to fnox
// Throws an error if the path is not a known valid setting path
export function updateSettingByPath(settingPath: string, value: unknown): Settings {
  // Validate that the path is a known setting
  if (!VALID_SETTING_PATHS.has(settingPath)) {
    throw new Error(`Unknown setting path: ${settingPath}`)
  }

  ensureFulcrumDir()

  // Get old value for logging
  const oldSettings = getSettings()
  const oldValue = getNestedValue(oldSettings as unknown as Record<string, unknown>, settingPath)

  // Write to fnox (updates in-memory cache; writes to CLI only when available)
  const entry = FNOX_CONFIG_MAP[settingPath]
  if (entry) {
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
      setFnoxValue(settingPath, null)
    } else {
      setFnoxValue(settingPath, value)
    }
  }

  // Log setting change (mask sensitive values)
  const isSensitive = isSecretPath(settingPath)
  const logValue = isSensitive ? '***' : value
  const logOldValue = isSensitive ? '***' : oldValue
  if (oldValue !== value) {
    log.settings.info('Setting updated', { path: settingPath, from: logOldValue, to: logValue })
  }

  return getSettings()
}

// Update settings (partial update using legacy keys for backward compatibility)
export function updateSettings(updates: Partial<LegacySettings>): Settings {
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      const nestedPath = MIGRATION_MAP[key]
      if (nestedPath && VALID_SETTING_PATHS.has(nestedPath)) {
        updateSettingByPath(nestedPath, value)
      }
    }
  }

  return getSettings()
}

// Reset settings to defaults — clears all fnox keys (cache + CLI) and returns defaults
export function resetSettings(): Settings {
  for (const settingsPath of Object.keys(FNOX_CONFIG_MAP)) {
    setFnoxValue(settingsPath, null)
  }
  return { ...DEFAULT_SETTINGS }
}

// Get default value for a setting path
export function getDefaultValue(settingPath: string): unknown {
  return getNestedValue(DEFAULT_SETTINGS as unknown as Record<string, unknown>, settingPath)
}

// Ensure config is up-to-date on server startup
// Called on server startup to:
// 1. Migrate settings.json if it exists (handled by migrate-to-fnox.ts)
// 2. Set schema version
export function ensureLatestConfig(): void {
  ensureFulcrumDir()

  if (isFnoxAvailable()) {
    // Run settings.json → fnox migration if settings.json exists
    migrateSettingsJsonToFnox()

    // Ensure schema version is set
    setFnoxValue('_schemaVersion', CURRENT_SCHEMA_VERSION)
  }

  log.settings.info('Config initialized', { schemaVersion: CURRENT_SCHEMA_VERSION })
}

// Backward-compatible alias
export const ensureLatestSettings = ensureLatestConfig

// No-op for backward compat — fnox doesn't need a settings file
export function ensureSettingsFile(): void {
  // No-op: settings.json is no longer used
}
