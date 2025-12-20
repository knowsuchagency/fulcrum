import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Settings interface
export interface Settings {
  worktreeBasePath: string
  defaultGitReposDir: string
}

// Default settings
const DEFAULT_SETTINGS: Settings = {
  worktreeBasePath: path.join(os.homedir(), '.vibora', 'worktrees'),
  defaultGitReposDir: os.homedir(),
}

// Get the vibora directory path
export function getViboraDir(): string {
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

// Get settings (with defaults)
export function getSettings(): Settings {
  ensureViboraDir()
  const settingsPath = getSettingsPath()

  if (!fs.existsSync(settingsPath)) {
    return { ...DEFAULT_SETTINGS }
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf-8')
    const parsed = JSON.parse(content) as Partial<Settings>

    // Merge with defaults and expand paths
    return {
      worktreeBasePath: expandPath(parsed.worktreeBasePath ?? DEFAULT_SETTINGS.worktreeBasePath),
      defaultGitReposDir: expandPath(parsed.defaultGitReposDir ?? DEFAULT_SETTINGS.defaultGitReposDir),
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
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
