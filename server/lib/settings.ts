import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { log } from './logger'
import type { AgentType } from '@shared/types'

// Schema version for settings migration
// IMPORTANT: This must match the major version in package.json
// When bumping schema version, also bump major version with: mise run bump major
export const CURRENT_SCHEMA_VERSION = 9

// Editor app types
export type EditorApp = 'vscode' | 'cursor' | 'windsurf' | 'zed' | 'antigravity'

// Claude Code theme types
export type ClaudeCodeTheme = 'light' | 'light-ansi' | 'light-daltonized' | 'dark' | 'dark-ansi' | 'dark-daltonized'
export const CLAUDE_CODE_THEMES: ClaudeCodeTheme[] = ['light', 'light-ansi', 'light-daltonized', 'dark', 'dark-ansi', 'dark-daltonized']

// Nested settings interface
export interface Settings {
  _schemaVersion?: number
  server: {
    port: number
  }
  paths: {
    defaultGitReposDir: string
  }
  editor: {
    app: EditorApp
    host: string
    sshPort: number
  }
  integrations: {
    githubPat: string | null
    cloudflareApiToken: string | null
    cloudflareAccountId: string | null
  }
  agent: {
    defaultAgent: AgentType
    opencodeModel: string | null
    opencodeDefaultAgent: string
    opencodePlanAgent: string
  }
  appearance: {
    language: 'en' | 'zh' | null
    theme: 'system' | 'light' | 'dark' | null
    syncClaudeCodeTheme: boolean
    claudeCodeLightTheme: ClaudeCodeTheme
    claudeCodeDarkTheme: ClaudeCodeTheme
  }
}

// Default settings with new structure
const DEFAULT_SETTINGS: Settings = {
  _schemaVersion: CURRENT_SCHEMA_VERSION,
  server: {
    port: 7777,
  },
  paths: {
    defaultGitReposDir: os.homedir(),
  },
  editor: {
    app: 'vscode',
    host: '',
    sshPort: 22,
  },
  integrations: {
    githubPat: null,
    cloudflareApiToken: null,
    cloudflareAccountId: null,
  },
  agent: {
    defaultAgent: 'claude',
    opencodeModel: null,
    opencodeDefaultAgent: 'build',
    opencodePlanAgent: 'plan',
  },
  appearance: {
    language: null,
    theme: null,
    syncClaudeCodeTheme: false,
    claudeCodeLightTheme: 'light-ansi',
    claudeCodeDarkTheme: 'dark-ansi',
  },
}

// Old default port for migration detection
const OLD_DEFAULT_PORT = 3333

// Migration map from old flat keys to new nested paths
const MIGRATION_MAP: Record<string, string> = {
  port: 'server.port',
  defaultGitReposDir: 'paths.defaultGitReposDir',
  // remoteHost and hostname are handled specially in migrateSettings (need URL construction)
  sshPort: 'editor.sshPort',
  githubPat: 'integrations.githubPat',
  language: 'appearance.language',
  theme: 'appearance.theme',
  syncClaudeCodeTheme: 'appearance.syncClaudeCodeTheme',
  claudeCodeLightTheme: 'appearance.claudeCodeLightTheme',
  claudeCodeDarkTheme: 'appearance.claudeCodeDarkTheme',
}

// Helper: Get nested value from object using dot notation
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o, k) => {
    if (o && typeof o === 'object') {
      return (o as Record<string, unknown>)[k]
    }
    return undefined
  }, obj as unknown)
}

// Helper: Set nested value in object using dot notation
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  const lastKey = keys.pop()!
  let current = obj

  for (const key of keys) {
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }

  current[lastKey] = value
}

interface MigrationResult {
  migrated: boolean
  migratedKeys: string[]
  warnings: string[]
}

// Migrate flat settings to nested structure
function migrateSettings(parsed: Record<string, unknown>): MigrationResult {
  const result: MigrationResult = { migrated: false, migratedKeys: [], warnings: [] }

  // Check schema version - skip if already migrated
  const version = (parsed._schemaVersion as number) ?? 1
  if (version >= CURRENT_SCHEMA_VERSION) {
    return result
  }

  // Schema 1 → 2: Migrate flat keys to nested structure
  if (version < 2) {
    for (const [oldKey, newPath] of Object.entries(MIGRATION_MAP)) {
      // Check if old flat key exists
      if (oldKey in parsed && parsed[oldKey] !== undefined) {
        const oldValue = parsed[oldKey]

        // Special case: don't migrate old default port - let users get the new default
        if (oldKey === 'port' && oldValue === OLD_DEFAULT_PORT) {
          delete parsed[oldKey]
          result.migrated = true
          continue
        }

        // Check if new nested path already has a value (partial migration)
        const existingValue = getNestedValue(parsed, newPath)

        if (existingValue !== undefined) {
          // New path already has value - prefer new, log warning
          result.warnings.push(`Key "${oldKey}" exists but "${newPath}" already set. Removing old key.`)
        } else {
          // Migrate value to new nested path
          setNestedValue(parsed, newPath, oldValue)
          result.migratedKeys.push(oldKey)
        }

        // Remove old flat key
        delete parsed[oldKey]
        result.migrated = true
      }
    }

    // Clean up old remote settings if present (no longer used)
    delete parsed.remoteHost
    delete parsed.hostname
    delete parsed.remoteVibora
  }

  // Set schema version
  parsed._schemaVersion = CURRENT_SCHEMA_VERSION
  result.migrated = true

  return result
}

// Expand tilde in path and ensure absolute path
function expandPath(p: string): string {
  if (!p) return p
  // Handle single tilde (just home directory)
  if (p === '~') {
    return os.homedir()
  }
  // Handle tilde with path
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2))
  }
  // Convert relative paths to absolute
  if (!path.isAbsolute(p)) {
    return path.resolve(p)
  }
  return p
}

// Export expandPath for use in other modules (e.g., repositories route)
export { expandPath }

// Get the vibora directory path
// Priority: VIBORA_DIR env var → CWD .vibora → ~/.vibora
export function getViboraDir(): string {
  // 1. VIBORA_DIR env var (explicit override)
  if (process.env.VIBORA_DIR) {
    return expandPath(process.env.VIBORA_DIR)
  }
  // 2. CWD .vibora (per-worktree isolation)
  const cwdVibora = path.join(process.cwd(), '.vibora')
  if (fs.existsSync(cwdVibora)) {
    return cwdVibora
  }
  // 3. ~/.vibora (default)
  return path.join(os.homedir(), '.vibora')
}

// Get database path (always derived from viboraDir)
export function getDatabasePath(): string {
  return path.join(getViboraDir(), 'vibora.db')
}

// Get worktree base path (always derived from viboraDir)
export function getWorktreeBasePath(): string {
  return path.join(getViboraDir(), 'worktrees')
}

// Get the settings file path
function getSettingsPath(): string {
  return path.join(getViboraDir(), 'settings.json')
}

// Ensure the vibora directory exists
export function ensureViboraDir(): void {
  const viboraDir = getViboraDir()
  if (!fs.existsSync(viboraDir)) {
    fs.mkdirSync(viboraDir, { recursive: true })
  }
}

// Ensure the worktrees directory exists
export function ensureWorktreesDir(): void {
  const worktreesDir = getWorktreeBasePath()
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true })
  }
}

// Ensure settings file exists with defaults
function ensureSettingsFile(): void {
  const settingsPath = getSettingsPath()
  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8')
  }
}

// Initialize all required directories and files
export function initializeViboraDirectories(): void {
  ensureViboraDir()
  ensureSettingsFile()
  ensureWorktreesDir()
}

// Get settings (with defaults, running migration if needed)
// Precedence: env var → settings.json → default
export function getSettings(): Settings {
  ensureViboraDir()
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
    },
    appearance: {
      language: ((parsed.appearance as Record<string, unknown>)?.language as 'en' | 'zh' | null) ?? null,
      theme: ((parsed.appearance as Record<string, unknown>)?.theme as 'system' | 'light' | 'dark' | null) ?? null,
      syncClaudeCodeTheme: ((parsed.appearance as Record<string, unknown>)?.syncClaudeCodeTheme as boolean) ?? false,
      claudeCodeLightTheme: ((parsed.appearance as Record<string, unknown>)?.claudeCodeLightTheme as ClaudeCodeTheme) ?? 'light-ansi',
      claudeCodeDarkTheme: ((parsed.appearance as Record<string, unknown>)?.claudeCodeDarkTheme as ClaudeCodeTheme) ?? 'dark-ansi',
    },
  }

  // Apply environment variable overrides
  const portEnv = parseInt(process.env.PORT || '', 10)
  const editorSshPortEnv = parseInt(process.env.VIBORA_SSH_PORT || '', 10)

  return {
    ...fileSettings,
    server: {
      port: !isNaN(portEnv) && portEnv > 0 ? portEnv : fileSettings.server.port,
    },
    paths: {
      defaultGitReposDir: process.env.VIBORA_GIT_REPOS_DIR
        ? expandPath(process.env.VIBORA_GIT_REPOS_DIR)
        : fileSettings.paths.defaultGitReposDir,
    },
    editor: {
      app: fileSettings.editor.app,
      host: process.env.VIBORA_EDITOR_HOST ?? fileSettings.editor.host,
      sshPort: !isNaN(editorSshPortEnv) && editorSshPortEnv > 0 ? editorSshPortEnv : fileSettings.editor.sshPort,
    },
    integrations: {
      githubPat: process.env.GITHUB_PAT ?? fileSettings.integrations.githubPat,
      cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN ?? fileSettings.integrations.cloudflareApiToken,
      cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? fileSettings.integrations.cloudflareAccountId,
    },
    agent: fileSettings.agent,
    appearance: fileSettings.appearance,
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

// Legacy flat settings interface for backward compatibility
export interface LegacySettings {
  port: number
  defaultGitReposDir: string
  sshPort: number
  githubPat: string | null
  language: 'en' | 'zh' | null
  theme: 'system' | 'light' | 'dark' | null
  syncClaudeCodeTheme: boolean
  claudeCodeLightTheme: ClaudeCodeTheme
  claudeCodeDarkTheme: ClaudeCodeTheme
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

// Check if developer mode is enabled (VIBORA_DEVELOPER env var)
export function isDeveloperMode(): boolean {
  return process.env.VIBORA_DEVELOPER === '1' || process.env.VIBORA_DEVELOPER === 'true'
}

// Update a setting by dot-notation path
export function updateSettingByPath(settingPath: string, value: unknown): Settings {
  ensureViboraDir()
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
  ensureViboraDir()
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
  ensureViboraDir()
  fs.writeFileSync(getSettingsPath(), JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8')
  return { ...DEFAULT_SETTINGS }
}

// Get default value for a setting path
export function getDefaultValue(settingPath: string): unknown {
  return getNestedValue(DEFAULT_SETTINGS as unknown as Record<string, unknown>, settingPath)
}

// Notification settings types
export interface SoundNotificationConfig {
  enabled: boolean
  customSoundFile?: string // Path to user-uploaded sound file
}

export interface ToastNotificationConfig {
  enabled: boolean
}

export interface DesktopNotificationConfig {
  enabled: boolean
}

export interface SlackNotificationConfig {
  enabled: boolean
  webhookUrl?: string
}

export interface DiscordNotificationConfig {
  enabled: boolean
  webhookUrl?: string
}

export interface PushoverNotificationConfig {
  enabled: boolean
  appToken?: string
  userKey?: string
}

export interface NotificationSettings {
  enabled: boolean
  toast: ToastNotificationConfig
  desktop: DesktopNotificationConfig
  sound: SoundNotificationConfig
  slack: SlackNotificationConfig
  discord: DiscordNotificationConfig
  pushover: PushoverNotificationConfig
  _updatedAt?: number // Timestamp for optimistic locking - prevents stale tabs from overwriting settings
}

// Result type for updateNotificationSettings - either success or conflict
export type NotificationSettingsUpdateResult =
  | NotificationSettings
  | { conflict: true; current: NotificationSettings }

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  toast: { enabled: true },
  desktop: { enabled: true },
  sound: { enabled: true },
  slack: { enabled: false },
  discord: { enabled: false },
  pushover: { enabled: false },
}

// Get notification settings from settings.json
export function getNotificationSettings(): NotificationSettings {
  ensureViboraDir()
  const settingsPath = getSettingsPath()

  if (!fs.existsSync(settingsPath)) {
    return { ...DEFAULT_NOTIFICATION_SETTINGS, _updatedAt: Date.now() }
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf-8')
    const parsed = JSON.parse(content)
    const notifications = parsed.notifications as Partial<NotificationSettings> | undefined

    if (!notifications) {
      return { ...DEFAULT_NOTIFICATION_SETTINGS, _updatedAt: Date.now() }
    }

    return {
      enabled: notifications.enabled ?? true,
      toast: { enabled: true, ...notifications.toast },
      desktop: { enabled: true, ...notifications.desktop },
      sound: { enabled: false, ...notifications.sound },
      slack: { enabled: false, ...notifications.slack },
      discord: { enabled: false, ...notifications.discord },
      pushover: { enabled: false, ...notifications.pushover },
      _updatedAt: notifications._updatedAt ?? Date.now(),
    }
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS, _updatedAt: Date.now() }
  }
}

// Update notification settings with optional optimistic locking
// If clientTimestamp is provided and doesn't match current _updatedAt, returns conflict
export function updateNotificationSettings(
  updates: Partial<NotificationSettings>,
  clientTimestamp?: number
): NotificationSettingsUpdateResult {
  ensureViboraDir()
  const settingsPath = getSettingsPath()

  let parsed: Record<string, unknown> = {}
  if (fs.existsSync(settingsPath)) {
    try {
      parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    } catch {
      // Use empty if invalid
    }
  }

  const current = getNotificationSettings()

  // Check for stale update (optimistic locking)
  if (clientTimestamp !== undefined && current._updatedAt !== undefined) {
    if (clientTimestamp !== current._updatedAt) {
      log.settings.warn('Rejected stale notification settings update', {
        clientTimestamp,
        serverTimestamp: current._updatedAt,
        attemptedChanges: updates,
      })
      return { conflict: true, current }
    }
  }

  const updated: NotificationSettings = {
    enabled: updates.enabled ?? current.enabled,
    toast: { ...current.toast, ...updates.toast },
    desktop: { ...current.desktop, ...updates.desktop },
    sound: { ...current.sound, ...updates.sound },
    slack: { ...current.slack, ...updates.slack },
    discord: { ...current.discord, ...updates.discord },
    pushover: { ...current.pushover, ...updates.pushover },
    _updatedAt: Date.now(),
  }

  parsed.notifications = updated
  fs.writeFileSync(settingsPath, JSON.stringify(parsed, null, 2), 'utf-8')

  // Log what changed
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  if (updates.enabled !== undefined && updates.enabled !== current.enabled) {
    changes.enabled = { from: current.enabled, to: updates.enabled }
    // Log with stack trace when notifications are being disabled
    if (updates.enabled === false) {
      log.settings.warn('Notifications being DISABLED', {
        from: current.enabled,
        to: updates.enabled,
        stack: new Error().stack,
      })
    }
  }
  if (updates.toast?.enabled !== undefined && updates.toast.enabled !== current.toast.enabled) {
    changes['toast.enabled'] = { from: current.toast.enabled, to: updates.toast.enabled }
  }
  if (updates.desktop?.enabled !== undefined && updates.desktop.enabled !== current.desktop.enabled) {
    changes['desktop.enabled'] = { from: current.desktop.enabled, to: updates.desktop.enabled }
  }
  if (updates.sound?.enabled !== undefined && updates.sound.enabled !== current.sound.enabled) {
    changes['sound.enabled'] = { from: current.sound.enabled, to: updates.sound.enabled }
  }
  if (updates.slack?.enabled !== undefined && updates.slack.enabled !== current.slack.enabled) {
    changes['slack.enabled'] = { from: current.slack.enabled, to: updates.slack.enabled }
  }
  if (updates.discord?.enabled !== undefined && updates.discord.enabled !== current.discord.enabled) {
    changes['discord.enabled'] = { from: current.discord.enabled, to: updates.discord.enabled }
  }
  if (updates.pushover?.enabled !== undefined && updates.pushover.enabled !== current.pushover.enabled) {
    changes['pushover.enabled'] = { from: current.pushover.enabled, to: updates.pushover.enabled }
  }
  if (Object.keys(changes).length > 0) {
    log.settings.info('Notification settings updated', { changes })
  }

  return updated
}

// ==================== Claude Code Settings ====================
// These functions manage ~/.claude/settings.json for configuring Claude Code

// Get Claude settings file path
function getClaudeSettingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json')
}

// Read Claude Code settings
export function getClaudeSettings(): Record<string, unknown> {
  const settingsPath = getClaudeSettingsPath()
  if (!fs.existsSync(settingsPath)) return {}
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  } catch {
    return {}
  }
}

// Update Claude Code settings (merges with existing)
export function updateClaudeSettings(updates: Record<string, unknown>): void {
  const settingsPath = getClaudeSettingsPath()
  const dir = path.dirname(settingsPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const current = getClaudeSettings()
  const merged = { ...current, ...updates }
  fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf-8')
}

// ==================== Claude Code Config ====================
// These functions manage ~/.claude.json for Claude Code preferences (theme, etc.)

// Get Claude config file path (~/.claude.json)
function getClaudeConfigPath(): string {
  return path.join(os.homedir(), '.claude.json')
}

// Read Claude Code config
export function getClaudeConfig(): Record<string, unknown> {
  const configPath = getClaudeConfigPath()
  if (!fs.existsSync(configPath)) return {}
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  } catch {
    return {}
  }
}

// Promise-based lock to serialize writes to ~/.claude.json
// Prevents race conditions when multiple tabs trigger concurrent updates
let claudeConfigLock: Promise<void> = Promise.resolve()

// Update Claude Code config (merges with existing)
// Uses promise chaining to ensure sequential writes and prevent corruption
export function updateClaudeConfig(updates: Record<string, unknown>): void {
  claudeConfigLock = claudeConfigLock.then(() => {
    const configPath = getClaudeConfigPath()
    const current = getClaudeConfig()
    const merged = { ...current, ...updates }
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8')
  }).catch((err) => {
    log.settings.error('Failed to update Claude config', { error: String(err) })
  })
}

// Update Claude Code theme if sync is enabled
// Uses user-configured themes for light/dark mode
export function syncClaudeCodeTheme(resolvedTheme: 'light' | 'dark'): void {
  const settings = getSettings()
  if (!settings.appearance.syncClaudeCodeTheme) return

  const claudeTheme = resolvedTheme === 'light'
    ? settings.appearance.claudeCodeLightTheme
    : settings.appearance.claudeCodeDarkTheme
  updateClaudeConfig({ theme: claudeTheme })
  log.settings.info('Synced Claude Code theme', { claudeTheme, resolvedTheme })
}

// ==================== z.ai Settings ====================
// These settings control the z.ai proxy integration for Claude Code

export interface ZAiSettings {
  enabled: boolean
  apiKey: string | null
  haikuModel: string
  sonnetModel: string
  opusModel: string
}

const DEFAULT_ZAI_SETTINGS: ZAiSettings = {
  enabled: false,
  apiKey: null,
  haikuModel: 'glm-4.5-air',
  sonnetModel: 'glm-4.7',
  opusModel: 'glm-4.7',
}

// Get z.ai settings from settings.json
export function getZAiSettings(): ZAiSettings {
  ensureViboraDir()
  const settingsPath = getSettingsPath()

  if (!fs.existsSync(settingsPath)) {
    return DEFAULT_ZAI_SETTINGS
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf-8')
    const parsed = JSON.parse(content)
    const zai = parsed.zai as Partial<ZAiSettings> | undefined

    if (!zai) {
      return DEFAULT_ZAI_SETTINGS
    }

    return {
      enabled: zai.enabled ?? false,
      apiKey: zai.apiKey ?? null,
      haikuModel: zai.haikuModel ?? DEFAULT_ZAI_SETTINGS.haikuModel,
      sonnetModel: zai.sonnetModel ?? DEFAULT_ZAI_SETTINGS.sonnetModel,
      opusModel: zai.opusModel ?? DEFAULT_ZAI_SETTINGS.opusModel,
    }
  } catch {
    return DEFAULT_ZAI_SETTINGS
  }
}

// Update z.ai settings
export function updateZAiSettings(updates: Partial<ZAiSettings>): ZAiSettings {
  ensureViboraDir()
  const settingsPath = getSettingsPath()

  let parsed: Record<string, unknown> = {}
  if (fs.existsSync(settingsPath)) {
    try {
      parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    } catch {
      // Use empty if invalid
    }
  }

  const current = getZAiSettings()
  const updated: ZAiSettings = {
    enabled: updates.enabled ?? current.enabled,
    apiKey: updates.apiKey !== undefined ? updates.apiKey : current.apiKey,
    haikuModel: updates.haikuModel ?? current.haikuModel,
    sonnetModel: updates.sonnetModel ?? current.sonnetModel,
    opusModel: updates.opusModel ?? current.opusModel,
  }

  parsed.zai = updated
  fs.writeFileSync(settingsPath, JSON.stringify(parsed, null, 2), 'utf-8')

  return updated
}

// Helper: Deep merge user settings with defaults, preserving user values
// User values take precedence; missing keys are filled from defaults
// Extra keys in user settings (not in defaults) are preserved
function deepMergeWithDefaults(
  userSettings: Record<string, unknown>,
  defaults: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  // Start with all keys from defaults
  for (const key of Object.keys(defaults)) {
    const defaultValue = defaults[key]
    const userValue = userSettings[key]

    if (defaultValue !== null && typeof defaultValue === 'object' && !Array.isArray(defaultValue)) {
      // Recurse for nested objects
      result[key] = deepMergeWithDefaults(
        (userValue as Record<string, unknown>) ?? {},
        defaultValue as Record<string, unknown>
      )
    } else if (userValue !== undefined) {
      // User value exists, use it (even if null)
      result[key] = userValue
    } else {
      // Use default
      result[key] = defaultValue
    }
  }

  // Preserve any extra keys from user settings (e.g., desktop.zoomLevel, lastUpdateCheck)
  for (const key of Object.keys(userSettings)) {
    if (!(key in result)) {
      result[key] = userSettings[key]
    }
  }

  return result
}

// Ensure settings file is up-to-date with latest schema
// Called on server startup to:
// 1. Run migrations for old flat settings
// 2. Add any missing keys with default values
// 3. Set schema version to current
// 4. Write back to file
export function ensureLatestSettings(): void {
  ensureViboraDir()
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

// Export helper functions for use in other modules
export { getNestedValue, setNestedValue }
