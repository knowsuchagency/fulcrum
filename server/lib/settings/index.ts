// Re-export all public APIs for backward compatibility
// All existing imports from './settings' will continue to work

// Types and constants
export {
  CURRENT_SCHEMA_VERSION,
  CLAUDE_CODE_THEMES,
  DEFAULT_SETTINGS,
  VALID_SETTING_PATHS,
  MIGRATION_MAP,
  type EditorApp,
  type ClaudeCodeTheme,
  type TaskType,
  type AssistantProvider,
  type AssistantModel,
  type Settings,
  type LegacySettings,
  type SoundNotificationConfig,
  type ToastNotificationConfig,
  type DesktopNotificationConfig,
  type SlackNotificationConfig,
  type DiscordNotificationConfig,
  type PushoverNotificationConfig,
  type WhatsAppNotificationConfig,
  type TelegramNotificationConfig,
  type GmailNotificationConfig,
  type NotificationSettings,
  type NotificationSettingsUpdateResult,
  type ZAiSettings,
} from './types'

// Path utilities
export {
  enableTestMode,
  isTestMode,
  expandPath,
  getFulcrumDir,
  getDatabasePath,
  getWorktreeBasePath,
  getScratchBasePath,
  ensureFulcrumDir,
  ensureWorktreesDir,
  ensureScratchDir,
  getSettingsPath,
} from './paths'

// Migration utilities (exported for tests)
export { getNestedValue, setNestedValue } from './migration'

// Core settings CRUD
export {
  ensureSettingsFile,
  getSettings,
  getSetting,
  getSettingByKey,
  toLegacySettings,
  isDeveloperMode,
  updateSettingByPath,
  updateSettings,
  resetSettings,
  getDefaultValue,
  ensureLatestSettings,
} from './core'

// Notification settings
export {
  getNotificationSettings,
  updateNotificationSettings,
} from './notifications'

// Claude Code settings
export {
  getClaudeSettings,
  updateClaudeSettings,
  getClaudeConfig,
  updateClaudeConfig,
  syncClaudeCodeTheme,
} from './claude-code'

// z.ai settings
export {
  getZAiSettings,
  updateZAiSettings,
} from './zai'

// fnox secrets management
export {
  isFnoxAvailable,
  isSecretPath,
  getFnoxSecret,
  setFnoxSecret,
  removeFnoxSecret,
  initFnoxSecrets,
  getFnoxSecretCount,
  FNOX_SECRET_MAP,
} from './fnox'

// initializeFulcrumDirectories needs to include ensureSettingsFile
// We import from paths and core, then export a combined function
import { ensureFulcrumDir, ensureWorktreesDir } from './paths'
import { ensureSettingsFile } from './core'

// Initialize all required directories and files
export function initializeFulcrumDirectories(): void {
  ensureFulcrumDir()
  ensureSettingsFile()
  ensureWorktreesDir()
}
