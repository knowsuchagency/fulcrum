import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Settings interface (databasePath and worktreeBasePath are derived from viboraDir)
export interface Settings {
  port: number
  defaultGitReposDir: string
  taskCreationCommand: string
  hostname: string
  sshPort: number
  basicAuthUsername: string | null
  basicAuthPassword: string | null
  linearApiKey: string | null
  githubPat: string | null
}

// Default settings
const DEFAULT_SETTINGS: Settings = {
  port: 3333,
  defaultGitReposDir: os.homedir(),
  taskCreationCommand: 'claude --dangerously-skip-permissions',
  hostname: '',
  sshPort: 22,
  basicAuthUsername: null,
  basicAuthPassword: null,
  linearApiKey: null,
  githubPat: null,
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
  const fileSettings: Settings = {
    port: parsed.port ?? DEFAULT_SETTINGS.port,
    defaultGitReposDir: expandPath(parsed.defaultGitReposDir ?? DEFAULT_SETTINGS.defaultGitReposDir),
    taskCreationCommand: parsed.taskCreationCommand ?? DEFAULT_SETTINGS.taskCreationCommand,
    hostname: parsed.hostname ?? DEFAULT_SETTINGS.hostname,
    sshPort: parsed.sshPort ?? DEFAULT_SETTINGS.sshPort,
    basicAuthUsername: parsed.basicAuthUsername ?? null,
    basicAuthPassword: parsed.basicAuthPassword ?? null,
    linearApiKey: parsed.linearApiKey ?? null,
    githubPat: parsed.githubPat ?? null,
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
    taskCreationCommand: process.env.VIBORA_TASK_CREATION_COMMAND ?? fileSettings.taskCreationCommand,
    hostname: process.env.VIBORA_HOSTNAME ?? fileSettings.hostname,
    sshPort: !isNaN(sshPortEnv) && sshPortEnv > 0 ? sshPortEnv : fileSettings.sshPort,
    basicAuthUsername: process.env.VIBORA_BASIC_AUTH_USERNAME ?? fileSettings.basicAuthUsername,
    basicAuthPassword: process.env.VIBORA_BASIC_AUTH_PASSWORD ?? fileSettings.basicAuthPassword,
    linearApiKey: process.env.LINEAR_API_KEY ?? fileSettings.linearApiKey,
    githubPat: process.env.GITHUB_PAT ?? fileSettings.githubPat,
  }
}

// Get a single setting value
export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  return getSettings()[key]
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
