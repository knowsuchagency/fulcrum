import * as fs from 'fs'
import { log } from '../logger'
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  MIGRATION_MAP,
  VALID_SETTING_PATHS,
  type ClaudeCodeTheme,
  type EditorApp,
  type LegacySettings,
  type Settings,
  type AssistantProvider,
  type AssistantModel,
  type ChannelsSettings,
  type CalDavSettings,
  type RitualConfig,
} from './types'
import type { AgentType } from '@shared/types'
import { ensureFulcrumDir, expandPath, getSettingsPath } from './paths'
import {
  getNestedValue,
  setNestedValue,
  migrateSettings,
  migrateTaskType,
  deepMergeWithDefaults,
} from './migration'
import { DEFAULT_NOTIFICATION_SETTINGS } from './notifications'
import { DEFAULT_ZAI_SETTINGS } from './zai'

// Ensure settings file exists with defaults
export function ensureSettingsFile(): void {
  const settingsPath = getSettingsPath()
  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8')
  }
}

// Get settings (with defaults, running migration if needed)
// Precedence: env var → settings.json → default
export function getSettings(): Settings {
  ensureFulcrumDir()
  const settingsPath = getSettingsPath()

  let parsed: Record<string, unknown> = {}

  if (fs.existsSync(settingsPath)) {
    try {
      const content = fs.readFileSync(settingsPath, 'utf-8')
      parsed = JSON.parse(content)
    } catch {
      // Use empty parsed if file is invalid
    }
  }

  // Run migration if needed
  const migrationResult = migrateSettings(parsed)
  if (migrationResult.migrated) {
    if (migrationResult.migratedKeys.length > 0) {
      log.settings.info('Migrated settings to nested structure', {
        migratedKeys: migrationResult.migratedKeys,
      })
    }
    if (migrationResult.warnings.length > 0) {
      log.settings.warn('Settings migration warnings', {
        warnings: migrationResult.warnings,
      })
    }
    // Write migrated settings back to file
    fs.writeFileSync(settingsPath, JSON.stringify(parsed, null, 2), 'utf-8')
  }

  // Build settings from nested structure with defaults
  const fileSettings: Settings = {
    _schemaVersion: CURRENT_SCHEMA_VERSION,
    server: {
      port: (parsed.server as Record<string, unknown>)?.port as number ?? DEFAULT_SETTINGS.server.port,
    },
    paths: {
      defaultGitReposDir: expandPath(
        ((parsed.paths as Record<string, unknown>)?.defaultGitReposDir as string) ?? DEFAULT_SETTINGS.paths.defaultGitReposDir
      ),
    },
    editor: {
      app: ((parsed.editor as Record<string, unknown>)?.app as EditorApp) ?? DEFAULT_SETTINGS.editor.app,
      host: ((parsed.editor as Record<string, unknown>)?.host as string) ?? DEFAULT_SETTINGS.editor.host,
      sshPort: ((parsed.editor as Record<string, unknown>)?.sshPort as number) ?? DEFAULT_SETTINGS.editor.sshPort,
    },
    integrations: {
      githubPat: ((parsed.integrations as Record<string, unknown>)?.githubPat as string | null) ?? null,
      cloudflareApiToken: ((parsed.integrations as Record<string, unknown>)?.cloudflareApiToken as string | null) ?? null,
      cloudflareAccountId: ((parsed.integrations as Record<string, unknown>)?.cloudflareAccountId as string | null) ?? null,
    },
    agent: {
      defaultAgent: ((parsed.agent as Record<string, unknown>)?.defaultAgent as AgentType) ?? DEFAULT_SETTINGS.agent.defaultAgent,
      opencodeModel: ((parsed.agent as Record<string, unknown>)?.opencodeModel as string | null) ?? null,
      opencodeDefaultAgent: ((parsed.agent as Record<string, unknown>)?.opencodeDefaultAgent as string) ?? DEFAULT_SETTINGS.agent.opencodeDefaultAgent,
      opencodePlanAgent: ((parsed.agent as Record<string, unknown>)?.opencodePlanAgent as string) ?? DEFAULT_SETTINGS.agent.opencodePlanAgent,
      autoScrollToBottom: ((parsed.agent as Record<string, unknown>)?.autoScrollToBottom as boolean) ?? DEFAULT_SETTINGS.agent.autoScrollToBottom,
    },
    tasks: {
      // Migrate old 'code'/'non-code' values to 'worktree'/'non-worktree'
      defaultTaskType: migrateTaskType((parsed.tasks as Record<string, unknown>)?.defaultTaskType as string) ?? DEFAULT_SETTINGS.tasks.defaultTaskType,
      startWorktreeTasksImmediately: ((parsed.tasks as Record<string, unknown>)?.startWorktreeTasksImmediately as boolean) ?? ((parsed.tasks as Record<string, unknown>)?.startCodeTasksImmediately as boolean) ?? DEFAULT_SETTINGS.tasks.startWorktreeTasksImmediately,
    },
    appearance: {
      language: ((parsed.appearance as Record<string, unknown>)?.language as 'en' | 'zh' | null) ?? null,
      theme: ((parsed.appearance as Record<string, unknown>)?.theme as 'system' | 'light' | 'dark' | null) ?? null,
      timezone: ((parsed.appearance as Record<string, unknown>)?.timezone as string | null) ?? null,
      syncClaudeCodeTheme: ((parsed.appearance as Record<string, unknown>)?.syncClaudeCodeTheme as boolean) ?? false,
      claudeCodeLightTheme: ((parsed.appearance as Record<string, unknown>)?.claudeCodeLightTheme as ClaudeCodeTheme) ?? 'light-ansi',
      claudeCodeDarkTheme: ((parsed.appearance as Record<string, unknown>)?.claudeCodeDarkTheme as ClaudeCodeTheme) ?? 'dark-ansi',
    },
    assistant: {
      provider: ((parsed.assistant as Record<string, unknown>)?.provider as AssistantProvider) ?? DEFAULT_SETTINGS.assistant.provider,
      model: ((parsed.assistant as Record<string, unknown>)?.model as AssistantModel) ?? DEFAULT_SETTINGS.assistant.model,
      customInstructions: ((parsed.assistant as Record<string, unknown>)?.customInstructions as string | null) ?? null,
      documentsDir: expandPath(
        ((parsed.assistant as Record<string, unknown>)?.documentsDir as string) ?? DEFAULT_SETTINGS.assistant.documentsDir
      ),
      ritualsEnabled: ((parsed.assistant as Record<string, unknown>)?.ritualsEnabled as boolean) ?? DEFAULT_SETTINGS.assistant.ritualsEnabled,
      morningRitual: deepMergeWithDefaults(
        ((parsed.assistant as Record<string, unknown>)?.morningRitual as Record<string, unknown>) ?? {},
        DEFAULT_SETTINGS.assistant.morningRitual as unknown as Record<string, unknown>
      ) as RitualConfig,
      eveningRitual: deepMergeWithDefaults(
        ((parsed.assistant as Record<string, unknown>)?.eveningRitual as Record<string, unknown>) ?? {},
        DEFAULT_SETTINGS.assistant.eveningRitual as unknown as Record<string, unknown>
      ) as RitualConfig,
    },
    channels: deepMergeWithDefaults(
      (parsed.channels as Record<string, unknown>) ?? {},
      DEFAULT_SETTINGS.channels as unknown as Record<string, unknown>
    ) as ChannelsSettings,
    caldav: deepMergeWithDefaults(
      (parsed.caldav as Record<string, unknown>) ?? {},
      DEFAULT_SETTINGS.caldav as unknown as Record<string, unknown>
    ) as CalDavSettings,
  }

  // Apply environment variable overrides
  const portEnv = parseInt(process.env.PORT || '', 10)
  const editorSshPortEnv = parseInt(process.env.FULCRUM_SSH_PORT || '', 10)

  return {
    ...fileSettings,
    server: {
      port: !isNaN(portEnv) && portEnv > 0 ? portEnv : fileSettings.server.port,
    },
    paths: {
      defaultGitReposDir: process.env.FULCRUM_GIT_REPOS_DIR
        ? expandPath(process.env.FULCRUM_GIT_REPOS_DIR)
        : fileSettings.paths.defaultGitReposDir,
    },
    editor: {
      app: fileSettings.editor.app,
      host: process.env.FULCRUM_EDITOR_HOST ?? fileSettings.editor.host,
      sshPort: !isNaN(editorSshPortEnv) && editorSshPortEnv > 0 ? editorSshPortEnv : fileSettings.editor.sshPort,
    },
    integrations: {
      githubPat: process.env.GITHUB_PAT ?? fileSettings.integrations.githubPat,
      cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN ?? fileSettings.integrations.cloudflareApiToken,
      cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? fileSettings.integrations.cloudflareAccountId,
    },
    agent: fileSettings.agent,
    tasks: fileSettings.tasks,
    appearance: fileSettings.appearance,
    assistant: fileSettings.assistant,
    channels: fileSettings.channels,
    caldav: fileSettings.caldav,
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

// Update a setting by dot-notation path
// Throws an error if the path is not a known valid setting path
export function updateSettingByPath(settingPath: string, value: unknown): Settings {
  // Validate that the path is a known setting
  if (!VALID_SETTING_PATHS.has(settingPath)) {
    throw new Error(`Unknown setting path: ${settingPath}`)
  }

  ensureFulcrumDir()
  const settingsPath = getSettingsPath()

  let parsed: Record<string, unknown> = {}
  if (fs.existsSync(settingsPath)) {
    try {
      parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    } catch {
      // Use empty if invalid
    }
  }

  const oldValue = getNestedValue(parsed, settingPath)
  setNestedValue(parsed, settingPath, value)
  parsed._schemaVersion = CURRENT_SCHEMA_VERSION

  fs.writeFileSync(settingsPath, JSON.stringify(parsed, null, 2), 'utf-8')

  // Log setting change (mask sensitive values)
  const sensitiveKeys = ['githubPat', 'cloudflareApiToken', 'apiKey']
  const isSensitive = sensitiveKeys.some(key => settingPath.includes(key))
  const logValue = isSensitive ? '***' : value
  const logOldValue = isSensitive ? '***' : oldValue
  if (oldValue !== value) {
    log.settings.info('Setting updated', { path: settingPath, from: logOldValue, to: logValue })
  }

  return getSettings()
}

// Update settings (partial update using legacy keys for backward compatibility)
export function updateSettings(updates: Partial<LegacySettings>): Settings {
  ensureFulcrumDir()
  const settingsPath = getSettingsPath()

  let parsed: Record<string, unknown> = {}
  if (fs.existsSync(settingsPath)) {
    try {
      parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    } catch {
      // Use empty if invalid
    }
  }

  // Map legacy keys to nested paths and update
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      const nestedPath = MIGRATION_MAP[key]
      if (nestedPath) {
        setNestedValue(parsed, nestedPath, value)
      }
    }
  }

  parsed._schemaVersion = CURRENT_SCHEMA_VERSION
  fs.writeFileSync(settingsPath, JSON.stringify(parsed, null, 2), 'utf-8')

  return getSettings()
}

// Reset settings to defaults
export function resetSettings(): Settings {
  ensureFulcrumDir()
  fs.writeFileSync(getSettingsPath(), JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8')
  return { ...DEFAULT_SETTINGS }
}

// Get default value for a setting path
export function getDefaultValue(settingPath: string): unknown {
  return getNestedValue(DEFAULT_SETTINGS as unknown as Record<string, unknown>, settingPath)
}

// Ensure settings file is up-to-date with latest schema
// Called on server startup to:
// 1. Run migrations for old flat settings
// 2. Add any missing keys with default values
// 3. Set schema version to current
// 4. Write back to file
export function ensureLatestSettings(): void {
  ensureFulcrumDir()
  const settingsPath = getSettingsPath()

  let parsed: Record<string, unknown> = {}
  if (fs.existsSync(settingsPath)) {
    try {
      parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    } catch {
      // Use empty if invalid
    }
  }

  // Capture original notifications.enabled before any changes
  const originalNotificationsEnabled = (parsed.notifications as Record<string, unknown>)?.enabled

  // Run flat→nested migration if needed
  migrateSettings(parsed)

  // Deep merge with default settings, preserving user values
  const merged = deepMergeWithDefaults(parsed, DEFAULT_SETTINGS as unknown as Record<string, unknown>)

  // Ensure notifications section exists with defaults
  if (!merged.notifications || typeof merged.notifications !== 'object') {
    merged.notifications = { ...DEFAULT_NOTIFICATION_SETTINGS }
  } else {
    merged.notifications = deepMergeWithDefaults(
      merged.notifications as Record<string, unknown>,
      DEFAULT_NOTIFICATION_SETTINGS as unknown as Record<string, unknown>
    )
  }

  // Log if notifications.enabled changed during normalization
  const mergedNotificationsEnabled = (merged.notifications as Record<string, unknown>)?.enabled
  if (originalNotificationsEnabled !== mergedNotificationsEnabled) {
    log.settings.warn('Notification enabled state changed during settings normalization', {
      from: originalNotificationsEnabled,
      to: mergedNotificationsEnabled,
      reason: originalNotificationsEnabled === undefined ? 'missing key, using default' : 'value changed during merge',
    })
  }

  // Ensure zai section exists with defaults
  if (!merged.zai || typeof merged.zai !== 'object') {
    merged.zai = { ...DEFAULT_ZAI_SETTINGS }
  } else {
    merged.zai = deepMergeWithDefaults(
      merged.zai as Record<string, unknown>,
      DEFAULT_ZAI_SETTINGS as unknown as Record<string, unknown>
    )
  }

  // Migrate deployment.cloudflareApiToken to integrations.cloudflareApiToken
  if (merged.deployment && typeof merged.deployment === 'object') {
    const deployment = merged.deployment as Record<string, unknown>
    if (deployment.cloudflareApiToken && !((merged.integrations as Record<string, unknown>)?.cloudflareApiToken)) {
      const integrations = (merged.integrations as Record<string, unknown>) ?? {}
      integrations.cloudflareApiToken = deployment.cloudflareApiToken
      merged.integrations = integrations
      log.settings.info('Migrated cloudflareApiToken from deployment to integrations')
    }
    // Remove the deployment section entirely
    delete merged.deployment
  }

  // Always set to current schema version
  merged._schemaVersion = CURRENT_SCHEMA_VERSION

  // Write back to file
  fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf-8')
  log.settings.info('Settings normalized to latest schema', { schemaVersion: CURRENT_SCHEMA_VERSION })
}
