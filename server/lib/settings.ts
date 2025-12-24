import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'

// Settings interface (databasePath and worktreeBasePath are derived from viboraDir)
export interface Settings {
  port: number
  defaultGitReposDir: string
  remoteHost: string
  sshPort: number
  basicAuthUsername: string | null
  basicAuthPassword: string | null
  linearApiKey: string | null
  githubPat: string | null
  language: 'en' | 'zh' | null // null = auto-detect from browser
}

// Default settings
const DEFAULT_SETTINGS: Settings = {
  port: 3333,
  defaultGitReposDir: os.homedir(),
  remoteHost: '',
  sshPort: 22,
  basicAuthUsername: null,
  basicAuthPassword: null,
  linearApiKey: null,
  githubPat: null,
  language: null,
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

// Get settings (with defaults, persisting any missing keys)
// Precedence: env var → settings.json → default
export function getSettings(): Settings {
  ensureViboraDir()
  const settingsPath = getSettingsPath()

  let parsed: Partial<Settings> = {}

  if (fs.existsSync(settingsPath)) {
    try {
      const content = fs.readFileSync(settingsPath, 'utf-8')
      parsed = JSON.parse(content) as Partial<Settings>
    } catch {
      // Use empty parsed if file is invalid
    }
  }

  // Check if any keys are missing from file
  const allKeys = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]
  const hasMissingKeys = allKeys.some((key) => !(key in parsed))

  // Merge: settings.json → default
  // Note: 'hostname' is legacy name, migrate to 'remoteHost'
  const fileSettings: Settings = {
    port: parsed.port ?? DEFAULT_SETTINGS.port,
    defaultGitReposDir: expandPath(parsed.defaultGitReposDir ?? DEFAULT_SETTINGS.defaultGitReposDir),
    remoteHost: parsed.remoteHost ?? (parsed as { hostname?: string }).hostname ?? DEFAULT_SETTINGS.remoteHost,
    sshPort: parsed.sshPort ?? DEFAULT_SETTINGS.sshPort,
    basicAuthUsername: parsed.basicAuthUsername ?? null,
    basicAuthPassword: parsed.basicAuthPassword ?? null,
    linearApiKey: parsed.linearApiKey ?? null,
    githubPat: parsed.githubPat ?? null,
    language: parsed.language ?? null,
  }

  // Persist missing keys back to file (only file settings, not env overrides)
  if (hasMissingKeys) {
    fs.writeFileSync(settingsPath, JSON.stringify(fileSettings, null, 2), 'utf-8')
  }

  // Apply environment variable overrides
  const portEnv = parseInt(process.env.PORT || '', 10)
  const sshPortEnv = parseInt(process.env.VIBORA_SSH_PORT || '', 10)
  return {
    port: !isNaN(portEnv) && portEnv > 0 ? portEnv : fileSettings.port,
    defaultGitReposDir: process.env.VIBORA_GIT_REPOS_DIR
      ? expandPath(process.env.VIBORA_GIT_REPOS_DIR)
      : fileSettings.defaultGitReposDir,
    remoteHost: process.env.VIBORA_REMOTE_HOST ?? process.env.VIBORA_HOSTNAME ?? fileSettings.remoteHost,
    sshPort: !isNaN(sshPortEnv) && sshPortEnv > 0 ? sshPortEnv : fileSettings.sshPort,
    basicAuthUsername: process.env.VIBORA_BASIC_AUTH_USERNAME ?? fileSettings.basicAuthUsername,
    basicAuthPassword: process.env.VIBORA_BASIC_AUTH_PASSWORD ?? fileSettings.basicAuthPassword,
    linearApiKey: process.env.LINEAR_API_KEY ?? fileSettings.linearApiKey,
    githubPat: process.env.GITHUB_PAT ?? fileSettings.githubPat,
    language: fileSettings.language,
  }
}

// Get a single setting value
export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  return getSettings()[key]
}

// Check if developer mode is enabled (VIBORA_DEVELOPER env var)
export function isDeveloperMode(): boolean {
  return process.env.VIBORA_DEVELOPER === '1' || process.env.VIBORA_DEVELOPER === 'true'
}

// Get session secret derived from password (for signing session cookies)
// Returns null if auth is not configured
export function getSessionSecret(): string | null {
  const settings = getSettings()
  if (!settings.basicAuthPassword) {
    return null
  }
  return crypto.createHash('sha256').update(settings.basicAuthPassword + 'vibora-session').digest('hex')
}

// Update settings (partial update)
export function updateSettings(updates: Partial<Settings>): Settings {
  ensureViboraDir()
  const current = getSettings()
  const updated = { ...current, ...updates }

  fs.writeFileSync(getSettingsPath(), JSON.stringify(updated, null, 2), 'utf-8')

  return updated
}

// Reset settings to defaults
export function resetSettings(): Settings {
  ensureViboraDir()
  fs.writeFileSync(getSettingsPath(), JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8')
  return { ...DEFAULT_SETTINGS }
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
