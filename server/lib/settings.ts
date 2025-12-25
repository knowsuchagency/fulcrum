import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import { log } from './logger'

// Schema version for settings migration
const CURRENT_SCHEMA_VERSION = 2

// Editor app types
export type EditorApp = 'vscode' | 'cursor' | 'windsurf' | 'zed'

// Nested settings interface
export interface Settings {
  _schemaVersion?: number
  server: {
    port: number
  }
  paths: {
    defaultGitReposDir: string
  }
  authentication: {
    username: string | null
    password: string | null
  }
  remoteVibora: {
    host: string
    port: number
  }
  editor: {
    app: EditorApp
    host: string
    sshPort: number
  }
  integrations: {
    linearApiKey: string | null
    githubPat: string | null
  }
  appearance: {
    language: 'en' | 'zh' | null
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
  authentication: {
    username: null,
    password: null,
  },
  remoteVibora: {
    host: '',
    port: 7777,
  },
  editor: {
    app: 'vscode',
    host: '',
    sshPort: 22,
  },
  integrations: {
    linearApiKey: null,
    githubPat: null,
  },
  appearance: {
    language: null,
  },
}

// Old default port for migration detection
const OLD_DEFAULT_PORT = 3333

// Migration map from old flat keys to new nested paths
const MIGRATION_MAP: Record<string, string> = {
  port: 'server.port',
  defaultGitReposDir: 'paths.defaultGitReposDir',
  basicAuthUsername: 'authentication.username',
  basicAuthPassword: 'authentication.password',
  remoteHost: 'remoteVibora.host',
  hostname: 'remoteVibora.host', // Legacy key
  sshPort: 'editor.sshPort',
  linearApiKey: 'integrations.linearApiKey',
  githubPat: 'integrations.githubPat',
  language: 'appearance.language',
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

  // Set schema version
  parsed._schemaVersion = CURRENT_SCHEMA_VERSION
  result.migrated = true

  return result
}

// Expand tilde in path and ensure absolute path
function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2))
  }
  // Convert relative paths to absolute
  if (!path.isAbsolute(p)) {
    return path.resolve(p)
  }
  return p
}

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
    authentication: {
      username: ((parsed.authentication as Record<string, unknown>)?.username as string | null) ?? null,
      password: ((parsed.authentication as Record<string, unknown>)?.password as string | null) ?? null,
    },
    remoteVibora: {
      host: ((parsed.remoteVibora as Record<string, unknown>)?.host as string) ?? DEFAULT_SETTINGS.remoteVibora.host,
      port: ((parsed.remoteVibora as Record<string, unknown>)?.port as number) ?? DEFAULT_SETTINGS.remoteVibora.port,
    },
    editor: {
      app: ((parsed.editor as Record<string, unknown>)?.app as EditorApp) ?? DEFAULT_SETTINGS.editor.app,
      host: ((parsed.editor as Record<string, unknown>)?.host as string) ?? DEFAULT_SETTINGS.editor.host,
      sshPort: ((parsed.editor as Record<string, unknown>)?.sshPort as number) ?? DEFAULT_SETTINGS.editor.sshPort,
    },
    integrations: {
      linearApiKey: ((parsed.integrations as Record<string, unknown>)?.linearApiKey as string | null) ?? null,
      githubPat: ((parsed.integrations as Record<string, unknown>)?.githubPat as string | null) ?? null,
    },
    appearance: {
      language: ((parsed.appearance as Record<string, unknown>)?.language as 'en' | 'zh' | null) ?? null,
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
    authentication: {
      username: process.env.VIBORA_BASIC_AUTH_USERNAME ?? fileSettings.authentication.username,
      password: process.env.VIBORA_BASIC_AUTH_PASSWORD ?? fileSettings.authentication.password,
    },
    remoteVibora: {
      host: process.env.VIBORA_REMOTE_HOST ?? process.env.VIBORA_HOSTNAME ?? fileSettings.remoteVibora.host,
      port: fileSettings.remoteVibora.port,
    },
    editor: {
      app: fileSettings.editor.app,
      host: process.env.VIBORA_EDITOR_HOST ?? fileSettings.editor.host,
      sshPort: !isNaN(editorSshPortEnv) && editorSshPortEnv > 0 ? editorSshPortEnv : fileSettings.editor.sshPort,
    },
    integrations: {
      linearApiKey: process.env.LINEAR_API_KEY ?? fileSettings.integrations.linearApiKey,
      githubPat: process.env.GITHUB_PAT ?? fileSettings.integrations.githubPat,
    },
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
  remoteHost: string
  sshPort: number
  basicAuthUsername: string | null
  basicAuthPassword: string | null
  linearApiKey: string | null
  githubPat: string | null
  language: 'en' | 'zh' | null
}

// Convert nested settings to legacy flat format
export function toLegacySettings(settings: Settings): LegacySettings {
  return {
    port: settings.server.port,
    defaultGitReposDir: settings.paths.defaultGitReposDir,
    remoteHost: settings.remoteVibora.host,
    sshPort: settings.editor.sshPort,
    basicAuthUsername: settings.authentication.username,
    basicAuthPassword: settings.authentication.password,
    linearApiKey: settings.integrations.linearApiKey,
    githubPat: settings.integrations.githubPat,
    language: settings.appearance.language,
  }
}

// Check if developer mode is enabled (VIBORA_DEVELOPER env var)
export function isDeveloperMode(): boolean {
  return process.env.VIBORA_DEVELOPER === '1' || process.env.VIBORA_DEVELOPER === 'true'
}

// Get session secret derived from password (for signing session cookies)
// Returns null if auth is not configured
export function getSessionSecret(): string | null {
  const settings = getSettings()
  if (!settings.authentication.password) {
    return null
  }
  return crypto.createHash('sha256').update(settings.authentication.password + 'vibora-session').digest('hex')
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

  setNestedValue(parsed, settingPath, value)
  parsed._schemaVersion = CURRENT_SCHEMA_VERSION

  fs.writeFileSync(settingsPath, JSON.stringify(parsed, null, 2), 'utf-8')

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
  soundFile?: string
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
  sound: SoundNotificationConfig
  slack: SlackNotificationConfig
  discord: DiscordNotificationConfig
  pushover: PushoverNotificationConfig
}

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  sound: { enabled: false },
  slack: { enabled: false },
  discord: { enabled: false },
  pushover: { enabled: false },
}

// Get notification settings from settings.json
export function getNotificationSettings(): NotificationSettings {
  ensureViboraDir()
  const settingsPath = getSettingsPath()

  if (!fs.existsSync(settingsPath)) {
    return DEFAULT_NOTIFICATION_SETTINGS
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf-8')
    const parsed = JSON.parse(content)
    const notifications = parsed.notifications as Partial<NotificationSettings> | undefined

    if (!notifications) {
      return DEFAULT_NOTIFICATION_SETTINGS
    }

    return {
      enabled: notifications.enabled ?? false,
      sound: { enabled: false, ...notifications.sound },
      slack: { enabled: false, ...notifications.slack },
      discord: { enabled: false, ...notifications.discord },
      pushover: { enabled: false, ...notifications.pushover },
    }
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS
  }
}

// Update notification settings
export function updateNotificationSettings(updates: Partial<NotificationSettings>): NotificationSettings {
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
  const updated: NotificationSettings = {
    enabled: updates.enabled ?? current.enabled,
    sound: { ...current.sound, ...updates.sound },
    slack: { ...current.slack, ...updates.slack },
    discord: { ...current.discord, ...updates.discord },
    pushover: { ...current.pushover, ...updates.pushover },
  }

  parsed.notifications = updated
  fs.writeFileSync(settingsPath, JSON.stringify(parsed, null, 2), 'utf-8')

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

// Export helper functions for use in other modules
export { getNestedValue, setNestedValue }
