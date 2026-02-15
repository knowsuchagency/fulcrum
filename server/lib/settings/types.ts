import * as os from 'os'
import type { AgentType } from '@shared/types'

// Schema version for settings migration
// IMPORTANT: This must match the major version in package.json
// When bumping schema version, also bump major version with: mise run bump major
export const CURRENT_SCHEMA_VERSION = 3

// Editor app types
export type EditorApp = 'vscode' | 'cursor' | 'windsurf' | 'zed' | 'antigravity'

// Claude Code theme types
export type ClaudeCodeTheme = 'light' | 'light-ansi' | 'light-daltonized' | 'dark' | 'dark-ansi' | 'dark-daltonized'
export const CLAUDE_CODE_THEMES: ClaudeCodeTheme[] = ['light', 'light-ansi', 'light-daltonized', 'dark', 'dark-ansi', 'dark-daltonized']

// Task type for defaults
export type TaskType = 'worktree' | 'manual' | 'scratch'

// Assistant provider and model types
export type AssistantProvider = 'claude' | 'opencode'
export type AssistantModel = 'opus' | 'sonnet' | 'haiku'

// Ritual configuration (for assistant daily rituals)
export interface RitualConfig {
  time: string // "09:00" (24h format)
  prompt: string
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
// Email backend type
export type EmailBackend = 'imap' | 'gmail-api'

export interface EmailSettings {
  enabled: boolean
  backend: EmailBackend
  googleAccountId: string | null
  imap: ImapConfig
  pollIntervalSeconds: number
  /**
   * List of email addresses or domain patterns that can always interact with the assistant.
   * Supports exact matches (user@example.com) and wildcard domains (*@example.com).
   */
  allowedSenders: string[]
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

// CalDAV OAuth tokens (for Google Calendar)
export interface CalDavOAuthTokens {
  accessToken: string
  refreshToken: string
  expiration: number // Unix timestamp in seconds
}

// CalDAV calendar integration settings
// Credential fields are kept for backward compatibility / migration detection
// but are no longer the primary storage (moved to caldavAccounts table)
export interface CalDavSettings {
  enabled: boolean
  syncIntervalMinutes: number
  // Legacy fields - read during migration, no longer written to
  serverUrl: string
  username: string
  password: string
  authType: 'basic' | 'google-oauth'
  googleClientId: string
  googleClientSecret: string
  oauthTokens: CalDavOAuthTokens | null
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
    googleClientId: string | null
    googleClientSecret: string | null
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
    preferRemoteBranches: boolean
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
    observerModel: AssistantModel
    /** Provider for observe-only message processing (null = use main provider) */
    observerProvider: AssistantProvider | null
    /** OpenCode model for observer processing (null = use main agent.opencodeModel) */
    observerOpencodeModel: string | null
    customInstructions: string | null
    documentsDir: string
    ritualsEnabled: boolean
    morningRitual: RitualConfig
    eveningRitual: RitualConfig
  }
  channels: ChannelsSettings
  caldav: CalDavSettings
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
    googleClientId: null,
    googleClientSecret: null,
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
    preferRemoteBranches: false,
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
    observerModel: 'haiku',
    observerProvider: null,
    observerOpencodeModel: null,
    customInstructions: null,
    documentsDir: '~/.fulcrum/documents',
    ritualsEnabled: false,
    morningRitual: {
      time: '09:00',
      prompt: `Retrieve the most recent evening ritual plan from memory (search for tags: ritual, plan, evening-ritual).

Review the plan alongside any new messages or events that arrived overnight. Adjust priorities if needed based on new information.

Send the morning briefing via these channels (in order): email, Slack, WhatsApp, Telegram.

Then store the morning review as a memory tagged with: ritual, plan, morning-ritual.`,
    },
    eveningRitual: {
      time: '18:00',
      prompt: `Retrieve the most recent morning ritual plan from memory (search for tags: ritual, plan, morning-ritual) for context on what was planned today.

Review what was accomplished today (tasks completed, messages exchanged, calendar events). Identify unfinished items and any new priorities that emerged.

Create a concrete action plan for tomorrow with prioritized items.

Send the evening summary and tomorrow's plan via these channels (in order): email, Slack, WhatsApp, Telegram.

Then store the action plan as a memory tagged with: ritual, plan, evening-ritual.`,
    },
  },
  channels: {
    email: {
      enabled: false,
      backend: 'imap' as const,
      googleAccountId: null,
      imap: {
        host: '',
        port: 993,
        secure: true,
        user: '',
        password: '',
      },
      pollIntervalSeconds: 30,
      allowedSenders: [],
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
  caldav: {
    enabled: false,
    serverUrl: 'https://apidata.googleusercontent.com/caldav/v2/',
    username: '',
    password: '',
    syncIntervalMinutes: 15,
    authType: 'google-oauth',
    googleClientId: '',
    googleClientSecret: '',
    oauthTokens: null,
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
  'integrations.googleClientId',
  'integrations.googleClientSecret',
  'agent.defaultAgent',
  'agent.opencodeModel',
  'agent.opencodeDefaultAgent',
  'agent.opencodePlanAgent',
  'agent.autoScrollToBottom',
  'agent.claudeCodePath',
  'tasks.defaultTaskType',
  'tasks.startWorktreeTasksImmediately',
  'tasks.preferRemoteBranches',
  'appearance.language',
  'appearance.theme',
  'appearance.timezone',
  'appearance.syncClaudeCodeTheme',
  'appearance.claudeCodeLightTheme',
  'appearance.claudeCodeDarkTheme',
  'assistant.provider',
  'assistant.model',
  'assistant.observerModel',
  'assistant.observerProvider',
  'assistant.observerOpencodeModel',
  'assistant.customInstructions',
  'assistant.documentsDir',
  'assistant.ritualsEnabled',
  'assistant.morningRitual.time',
  'assistant.morningRitual.prompt',
  'assistant.eveningRitual.time',
  'assistant.eveningRitual.prompt',
  'channels.email.enabled',
  'channels.email.backend',
  'channels.email.googleAccountId',
  'channels.email.imap.host',
  'channels.email.imap.port',
  'channels.email.imap.secure',
  'channels.email.imap.user',
  'channels.email.imap.password',
  'channels.email.pollIntervalSeconds',
  'channels.email.allowedSenders',
  'channels.slack.enabled',
  'channels.slack.botToken',
  'channels.slack.appToken',
  'channels.discord.enabled',
  'channels.discord.botToken',
  'channels.telegram.enabled',
  'channels.telegram.botToken',
  'caldav.enabled',
  'caldav.syncIntervalMinutes',
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
  useMessagingChannel?: boolean // Send via messaging channel instead of webhook
}

export interface DiscordNotificationConfig {
  enabled: boolean
  webhookUrl?: string
  useMessagingChannel?: boolean // Send via messaging channel instead of webhook
}

export interface PushoverNotificationConfig {
  enabled: boolean
  appToken?: string
  userKey?: string
}

export interface WhatsAppNotificationConfig {
  enabled: boolean
}

export interface TelegramNotificationConfig {
  enabled: boolean
}

export interface GmailNotificationConfig {
  enabled: boolean
  googleAccountId?: string
}

export interface NotificationSettings {
  enabled: boolean
  toast: ToastNotificationConfig
  desktop: DesktopNotificationConfig
  sound: SoundNotificationConfig
  slack: SlackNotificationConfig
  discord: DiscordNotificationConfig
  pushover: PushoverNotificationConfig
  whatsapp: WhatsAppNotificationConfig
  telegram: TelegramNotificationConfig
  gmail: GmailNotificationConfig
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
