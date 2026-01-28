import * as os from 'os'
import type { AgentType } from '@shared/types'

// Schema version for settings migration
// IMPORTANT: This must match the major version in package.json
// When bumping schema version, also bump major version with: mise run bump major
export const CURRENT_SCHEMA_VERSION = 2

// Editor app types
export type EditorApp = 'vscode' | 'cursor' | 'windsurf' | 'zed' | 'antigravity'

// Claude Code theme types
export type ClaudeCodeTheme = 'light' | 'light-ansi' | 'light-daltonized' | 'dark' | 'dark-ansi' | 'dark-daltonized'
export const CLAUDE_CODE_THEMES: ClaudeCodeTheme[] = ['light', 'light-ansi', 'light-daltonized', 'dark', 'dark-ansi', 'dark-daltonized']

// Task type for defaults
export type TaskType = 'worktree' | 'non-worktree'

// Assistant provider and model types
export type AssistantProvider = 'claude' | 'opencode'
export type AssistantModel = 'opus' | 'sonnet' | 'haiku'

// Ritual configuration (for assistant daily rituals)
export interface RitualConfig {
  time: string // "09:00" (24h format)
  prompt: string
}

// Email SMTP configuration
export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
}

// Email IMAP configuration
export interface ImapConfig {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
}

// Email messaging settings
export interface EmailSettings {
  enabled: boolean
  smtp: SmtpConfig
  imap: ImapConfig
  pollIntervalSeconds: number
  /**
   * The email address to send from (appears in From header).
   * Required when SMTP user is not an email address (e.g., AWS SES access key).
   * Defaults to smtp.user if not specified.
   */
  sendAs: string | null
  /**
   * List of email addresses or domain patterns that can always interact with the assistant.
   * Supports exact matches (user@example.com) and wildcard domains (*@example.com).
   */
  allowedSenders: string[]
  /**
   * BCC address that will be copied on all outgoing emails from the assistant.
   * Useful for compliance, archiving, or monitoring purposes.
   */
  bcc: string | null
}

// Slack messaging settings
export interface SlackSettings {
  enabled: boolean
  botToken: string
  appToken: string
}

// Discord messaging settings
export interface DiscordSettings {
  enabled: boolean
  botToken: string
}

// Telegram messaging settings
export interface TelegramSettings {
  enabled: boolean
  botToken: string
}

// Channels settings (renamed from MessagingSettings)
export interface ChannelsSettings {
  email: EmailSettings
  slack: SlackSettings
  discord: DiscordSettings
  telegram: TelegramSettings
}

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
    autoScrollToBottom: boolean
    claudeCodePath: string | null
  }
  tasks: {
    defaultTaskType: TaskType
    startWorktreeTasksImmediately: boolean
  }
  appearance: {
    language: 'en' | 'zh' | null
    theme: 'system' | 'light' | 'dark' | null
    timezone: string | null // IANA timezone, null = system default
    syncClaudeCodeTheme: boolean
    claudeCodeLightTheme: ClaudeCodeTheme
    claudeCodeDarkTheme: ClaudeCodeTheme
  }
  assistant: {
    provider: AssistantProvider
    model: AssistantModel
    customInstructions: string | null
    documentsDir: string
    ritualsEnabled: boolean
    morningRitual: RitualConfig
    eveningRitual: RitualConfig
  }
  channels: ChannelsSettings
}

// Default settings with new structure
export const DEFAULT_SETTINGS: Settings = {
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
    autoScrollToBottom: true,
    claudeCodePath: null,
  },
  tasks: {
    defaultTaskType: 'worktree',
    startWorktreeTasksImmediately: true,
  },
  appearance: {
    language: null,
    theme: null,
    timezone: null,
    syncClaudeCodeTheme: false,
    claudeCodeLightTheme: 'light-ansi',
    claudeCodeDarkTheme: 'dark-ansi',
  },
  assistant: {
    provider: 'claude',
    model: 'sonnet',
    customInstructions: null,
    documentsDir: '~/.fulcrum/documents',
    ritualsEnabled: false,
    morningRitual: {
      time: '09:00',
      prompt: 'Review messages since yesterday evening, summarize what needs attention today, and send a prioritized action plan.',
    },
    eveningRitual: {
      time: '18:00',
      prompt: 'Summarize what was accomplished today, note pending items, and suggest focus areas for tomorrow.',
    },
  },
  channels: {
    email: {
      enabled: false,
      smtp: {
        host: '',
        port: 587,
        secure: false,
        user: '',
        password: '',
      },
      imap: {
        host: '',
        port: 993,
        secure: true,
        user: '',
        password: '',
      },
      pollIntervalSeconds: 30,
      sendAs: null,
      allowedSenders: [],
      bcc: null,
    },
    slack: {
      enabled: false,
      botToken: '',
      appToken: '',
    },
    discord: {
      enabled: false,
      botToken: '',
    },
    telegram: {
      enabled: false,
      botToken: '',
    },
  },
}

// Old default port for migration detection
export const OLD_DEFAULT_PORT = 3333

// Valid setting paths that can be updated via updateSettingByPath
// This ensures we don't silently write to unknown paths
export const VALID_SETTING_PATHS = new Set([
  'server.port',
  'paths.defaultGitReposDir',
  'editor.app',
  'editor.host',
  'editor.sshPort',
  'integrations.githubPat',
  'integrations.cloudflareApiToken',
  'integrations.cloudflareAccountId',
  'agent.defaultAgent',
  'agent.opencodeModel',
  'agent.opencodeDefaultAgent',
  'agent.opencodePlanAgent',
  'agent.autoScrollToBottom',
  'agent.claudeCodePath',
  'tasks.defaultTaskType',
  'tasks.startWorktreeTasksImmediately',
  'appearance.language',
  'appearance.theme',
  'appearance.timezone',
  'appearance.syncClaudeCodeTheme',
  'appearance.claudeCodeLightTheme',
  'appearance.claudeCodeDarkTheme',
  'assistant.provider',
  'assistant.model',
  'assistant.customInstructions',
  'assistant.documentsDir',
  'assistant.ritualsEnabled',
  'assistant.morningRitual.time',
  'assistant.morningRitual.prompt',
  'assistant.eveningRitual.time',
  'assistant.eveningRitual.prompt',
  'channels.email.enabled',
  'channels.email.smtp.host',
  'channels.email.smtp.port',
  'channels.email.smtp.secure',
  'channels.email.smtp.user',
  'channels.email.smtp.password',
  'channels.email.imap.host',
  'channels.email.imap.port',
  'channels.email.imap.secure',
  'channels.email.imap.user',
  'channels.email.imap.password',
  'channels.email.pollIntervalSeconds',
  'channels.email.sendAs',
  'channels.email.allowedSenders',
  'channels.email.bcc',
  'channels.slack.enabled',
  'channels.slack.botToken',
  'channels.slack.appToken',
  'channels.discord.enabled',
  'channels.discord.botToken',
  'channels.telegram.enabled',
  'channels.telegram.botToken',
])

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

// z.ai settings interface
export interface ZAiSettings {
  enabled: boolean
  apiKey: string | null
  haikuModel: string
  sonnetModel: string
  opusModel: string
}

// Migration map from old flat keys to new nested paths
export const MIGRATION_MAP: Record<string, string> = {
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
