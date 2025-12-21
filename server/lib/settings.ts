import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Settings interface
export interface Settings {
  port: number
  databasePath: string
  worktreeBasePath: string
  defaultGitReposDir: string
  taskCreationCommand: string
}

// Default settings
const DEFAULT_SETTINGS: Settings = {
  port: 3333,
  databasePath: path.join(os.homedir(), '.vibora', 'vibora.db'),
  worktreeBasePath: path.join(os.homedir(), '.vibora', 'worktrees'),
  defaultGitReposDir: os.homedir(),
  taskCreationCommand: 'claude --dangerously-skip-permissions',
}

// Get the vibora directory path
// Checks CWD first for per-worktree isolation, falls back to ~/.vibora
export function getViboraDir(): string {
  const cwdVibora = path.join(process.cwd(), '.vibora')
  if (fs.existsSync(cwdVibora)) {
    return cwdVibora
  }
  return path.join(os.homedir(), '.vibora')
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
  const settings = getSettings()
  if (!fs.existsSync(settings.worktreeBasePath)) {
    fs.mkdirSync(settings.worktreeBasePath, { recursive: true })
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

// Expand tilde in path
function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2))
  }
  return p
}

// Get settings (with defaults, persisting any missing keys)
// Precedence: env var → settings.json → default
export function getSettings(): Settings {
  ensureViboraDir()
  const viboraDir = getViboraDir()
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

  // Merge: env var → settings.json → default
  // Note: databasePath defaults to {viboraDir}/vibora.db (CWD-aware)
  const fileSettings: Settings = {
    port: parsed.port ?? DEFAULT_SETTINGS.port,
    databasePath: expandPath(parsed.databasePath ?? path.join(viboraDir, 'vibora.db')),
    worktreeBasePath: expandPath(parsed.worktreeBasePath ?? DEFAULT_SETTINGS.worktreeBasePath),
    defaultGitReposDir: expandPath(parsed.defaultGitReposDir ?? DEFAULT_SETTINGS.defaultGitReposDir),
    taskCreationCommand: parsed.taskCreationCommand ?? DEFAULT_SETTINGS.taskCreationCommand,
  }

  // Persist missing keys back to file (only file settings, not env overrides)
  if (hasMissingKeys) {
    fs.writeFileSync(settingsPath, JSON.stringify(fileSettings, null, 2), 'utf-8')
  }

  // Apply environment variable overrides
  const portEnv = parseInt(process.env.PORT || '', 10)
  return {
    port: !isNaN(portEnv) && portEnv > 0 ? portEnv : fileSettings.port,
    databasePath: process.env.VIBORA_DATABASE_PATH
      ? expandPath(process.env.VIBORA_DATABASE_PATH)
      : fileSettings.databasePath,
    worktreeBasePath: process.env.VIBORA_WORKTREE_PATH
      ? expandPath(process.env.VIBORA_WORKTREE_PATH)
      : fileSettings.worktreeBasePath,
    defaultGitReposDir: process.env.VIBORA_GIT_REPOS_DIR
      ? expandPath(process.env.VIBORA_GIT_REPOS_DIR)
      : fileSettings.defaultGitReposDir,
    taskCreationCommand: process.env.VIBORA_TASK_CREATION_COMMAND ?? fileSettings.taskCreationCommand,
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

// Get default worktree base path (for backward compatibility)
export function getDefaultWorktreeBasePath(): string {
  return getSetting('worktreeBasePath')
}
