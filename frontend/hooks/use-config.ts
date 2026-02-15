import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'
export { CONFIG_KEYS } from '@shared/config-keys'
import { CONFIG_KEYS } from '@shared/config-keys'

// Use relative URLs - works with both Vite dev proxy and production
const API_BASE = ''

interface ConfigResponse {
  key: string
  value: string | number | boolean | string[] | null
  isDefault?: boolean
}

// Default values (client-side fallbacks)
const DEFAULT_PORT = 7777

// Editor app types
export type EditorApp = 'vscode' | 'cursor' | 'windsurf' | 'zed'

export function useConfig(key: string) {
  return useQuery({
    queryKey: ['config', key],
    queryFn: () => fetchJSON<ConfigResponse>(`${API_BASE}/api/config/${key}`),
  })
}

export function usePort() {
  const query = useConfig(CONFIG_KEYS.PORT)

  return {
    ...query,
    data: (query.data?.value as number) ?? DEFAULT_PORT,
    isDefault: query.data?.isDefault ?? true,
  }
}

// Read-only: derived from FULCRUM_DIR on server
export function useWorktreeBasePath() {
  const query = useConfig(CONFIG_KEYS.WORKTREE_BASE_PATH)

  return {
    ...query,
    data: (query.data?.value as string) ?? '',
  }
}

// Read-only: derived from FULCRUM_DIR on server
export function useScratchBasePath() {
  const query = useConfig(CONFIG_KEYS.SCRATCH_BASE_PATH)

  return {
    ...query,
    data: (query.data?.value as string) ?? '',
  }
}

// Read-only: system home directory for tilde expansion
export function useHomeDir() {
  const query = useConfig(CONFIG_KEYS.HOME_DIR)

  return {
    ...query,
    data: (query.data?.value as string) ?? '',
  }
}

export function useDefaultGitReposDir() {
  const query = useConfig(CONFIG_KEYS.DEFAULT_GIT_REPOS_DIR)

  return {
    ...query,
    // Default to empty string which will make the browser use home directory
    data: (query.data?.value as string) ?? '',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useEditorApp() {
  const query = useConfig(CONFIG_KEYS.EDITOR_APP)

  return {
    ...query,
    data: (query.data?.value as EditorApp) ?? 'vscode',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useEditorHost() {
  const query = useConfig(CONFIG_KEYS.EDITOR_HOST)

  return {
    ...query,
    data: (query.data?.value as string) ?? '',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useEditorSshPort() {
  const query = useConfig(CONFIG_KEYS.EDITOR_SSH_PORT)

  return {
    ...query,
    data: (query.data?.value as number) ?? 22,
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useGitHubPat() {
  const query = useConfig(CONFIG_KEYS.GITHUB_PAT)

  return {
    ...query,
    data: (query.data?.value as string) ?? '',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useGoogleClientId() {
  const query = useConfig(CONFIG_KEYS.GOOGLE_CLIENT_ID)

  return {
    ...query,
    data: (query.data?.value as string) ?? '',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useGoogleClientSecret() {
  const query = useConfig(CONFIG_KEYS.GOOGLE_CLIENT_SECRET)

  return {
    ...query,
    data: (query.data?.value as string) ?? '',
    isDefault: query.data?.isDefault ?? true,
  }
}

import type { AgentType } from '@/types'

export function useDefaultAgent() {
  const query = useConfig(CONFIG_KEYS.DEFAULT_AGENT)

  return {
    ...query,
    data: (query.data?.value as AgentType) ?? 'claude',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useOpencodeModel() {
  const query = useConfig(CONFIG_KEYS.OPENCODE_MODEL)

  return {
    ...query,
    data: (query.data?.value as string | null) ?? null,
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useOpencodeDefaultAgent() {
  const query = useConfig(CONFIG_KEYS.OPENCODE_DEFAULT_AGENT)

  return {
    ...query,
    data: (query.data?.value as string) ?? 'build',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useOpencodePlanAgent() {
  const query = useConfig(CONFIG_KEYS.OPENCODE_PLAN_AGENT)

  return {
    ...query,
    data: (query.data?.value as string) ?? 'plan',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useAutoScrollToBottom() {
  const query = useConfig(CONFIG_KEYS.AGENT_AUTO_SCROLL_TO_BOTTOM)

  return {
    ...query,
    // Default to true when value is undefined (preserve existing behavior)
    data: query.data?.value === undefined ? true : Boolean(query.data.value),
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useClaudeCodePath() {
  const query = useConfig(CONFIG_KEYS.CLAUDE_CODE_PATH)

  return {
    ...query,
    data: (query.data?.value as string | null) ?? null,
    isDefault: query.data?.isDefault ?? true,
  }
}

export type Language = 'en' | 'zh' | null

export function useLanguage() {
  const query = useConfig(CONFIG_KEYS.LANGUAGE)

  return {
    ...query,
    data: (query.data?.value as Language) ?? null,
    isDefault: query.data?.isDefault ?? true,
  }
}

export type Theme = 'system' | 'light' | 'dark'

export function useTheme() {
  const query = useConfig(CONFIG_KEYS.THEME)

  return {
    ...query,
    // null means system preference (default)
    data: (query.data?.value as Theme | null) ?? 'system',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useTimezone() {
  const query = useConfig(CONFIG_KEYS.TIMEZONE)

  return {
    ...query,
    // null means system timezone (default)
    data: (query.data?.value as string | null) ?? null,
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useSyncClaudeCodeTheme() {
  const query = useConfig(CONFIG_KEYS.SYNC_CLAUDE_CODE_THEME)

  return {
    ...query,
    data: Boolean(query.data?.value),
    isDefault: query.data?.isDefault ?? true,
  }
}

export type ClaudeCodeTheme = 'light' | 'light-ansi' | 'light-daltonized' | 'dark' | 'dark-ansi' | 'dark-daltonized'
export const CLAUDE_CODE_THEMES: ClaudeCodeTheme[] = ['light', 'light-ansi', 'light-daltonized', 'dark', 'dark-ansi', 'dark-daltonized']

export function useClaudeCodeLightTheme() {
  const query = useConfig(CONFIG_KEYS.CLAUDE_CODE_LIGHT_THEME)

  return {
    ...query,
    data: (query.data?.value as ClaudeCodeTheme) ?? 'light-ansi',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useClaudeCodeDarkTheme() {
  const query = useConfig(CONFIG_KEYS.CLAUDE_CODE_DARK_THEME)

  return {
    ...query,
    data: (query.data?.value as ClaudeCodeTheme) ?? 'dark-ansi',
    isDefault: query.data?.isDefault ?? true,
  }
}

// Task defaults
export type TaskType = 'worktree' | 'manual' | 'scratch'

export function useDefaultTaskType() {
  const query = useConfig(CONFIG_KEYS.DEFAULT_TASK_TYPE)

  return {
    ...query,
    data: (query.data?.value as TaskType) ?? 'worktree',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useStartWorktreeTasksImmediately() {
  const query = useConfig(CONFIG_KEYS.START_WORKTREE_TASKS_IMMEDIATELY)

  return {
    ...query,
    // Default to true when value is undefined
    data: query.data?.value === undefined ? true : Boolean(query.data.value),
    isDefault: query.data?.isDefault ?? true,
  }
}

export function usePreferRemoteBranches() {
  const query = useConfig(CONFIG_KEYS.PREFER_REMOTE_BRANCHES)

  return {
    ...query,
    data: query.data?.value === undefined ? false : Boolean(query.data.value),
    isDefault: query.data?.isDefault ?? true,
  }
}

/** @deprecated Use useStartWorktreeTasksImmediately instead */
export const useStartCodeTasksImmediately = useStartWorktreeTasksImmediately

// Assistant settings
export type AssistantProvider = 'claude' | 'opencode'
export type AssistantModel = 'opus' | 'sonnet' | 'haiku'
export const ASSISTANT_MODELS: AssistantModel[] = ['opus', 'sonnet', 'haiku']

export function useAssistantProvider() {
  const query = useConfig(CONFIG_KEYS.ASSISTANT_PROVIDER)

  return {
    ...query,
    data: (query.data?.value as AssistantProvider) ?? 'claude',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useAssistantModel() {
  const query = useConfig(CONFIG_KEYS.ASSISTANT_MODEL)

  return {
    ...query,
    data: (query.data?.value as AssistantModel) ?? 'sonnet',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useAssistantObserverModel() {
  const query = useConfig(CONFIG_KEYS.ASSISTANT_OBSERVER_MODEL)

  return {
    ...query,
    data: (query.data?.value as AssistantModel) ?? 'haiku',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useAssistantObserverProvider() {
  const query = useConfig(CONFIG_KEYS.ASSISTANT_OBSERVER_PROVIDER)

  return {
    ...query,
    data: (query.data?.value as AssistantProvider | null) ?? null,
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useAssistantObserverOpencodeModel() {
  const query = useConfig(CONFIG_KEYS.ASSISTANT_OBSERVER_OPENCODE_MODEL)

  return {
    ...query,
    data: (query.data?.value as string | null) ?? null,
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useAssistantCustomInstructions() {
  const query = useConfig(CONFIG_KEYS.ASSISTANT_CUSTOM_INSTRUCTIONS)

  return {
    ...query,
    data: (query.data?.value as string | null) ?? null,
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useAssistantDocumentsDir() {
  const query = useConfig(CONFIG_KEYS.ASSISTANT_DOCUMENTS_DIR)

  return {
    ...query,
    data: (query.data?.value as string) ?? '~/.fulcrum/documents',
    isDefault: query.data?.isDefault ?? true,
  }
}

// Ritual settings (under assistant)
export function useAssistantRitualsEnabled() {
  const query = useConfig(CONFIG_KEYS.ASSISTANT_RITUALS_ENABLED)

  return {
    ...query,
    data: Boolean(query.data?.value),
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useAssistantMorningRitualTime() {
  const query = useConfig(CONFIG_KEYS.ASSISTANT_MORNING_RITUAL_TIME)

  return {
    ...query,
    data: (query.data?.value as string) ?? '09:00',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useAssistantMorningRitualPrompt() {
  const query = useConfig(CONFIG_KEYS.ASSISTANT_MORNING_RITUAL_PROMPT)

  return {
    ...query,
    data: (query.data?.value as string) ?? '',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useAssistantEveningRitualTime() {
  const query = useConfig(CONFIG_KEYS.ASSISTANT_EVENING_RITUAL_TIME)

  return {
    ...query,
    data: (query.data?.value as string) ?? '18:00',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useAssistantEveningRitualPrompt() {
  const query = useConfig(CONFIG_KEYS.ASSISTANT_EVENING_RITUAL_PROMPT)

  return {
    ...query,
    data: (query.data?.value as string) ?? '',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useUpdateConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string | number | boolean | string[] | null }) =>
      fetchJSON<ConfigResponse>(`${API_BASE}/api/config/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      }),
    onSuccess: (_, { key }) => {
      queryClient.invalidateQueries({ queryKey: ['config', key] })

      // When GitHub PAT changes, invalidate all GitHub-related queries
      if (key === CONFIG_KEYS.GITHUB_PAT) {
        queryClient.invalidateQueries({ queryKey: ['github-user'] })
        queryClient.invalidateQueries({ queryKey: ['github-prs'] })
        queryClient.invalidateQueries({ queryKey: ['github-issues'] })
        queryClient.invalidateQueries({ queryKey: ['github-orgs'] })
      }
    },
  })
}

export function useResetConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (key: string) =>
      fetchJSON<ConfigResponse>(`${API_BASE}/api/config/${key}`, {
        method: 'DELETE',
      }),
    onSuccess: (_, key) => {
      queryClient.invalidateQueries({ queryKey: ['config', key] })
    },
  })
}

// Notification settings types
export interface NotificationSettings {
  enabled: boolean
  toast: { enabled: boolean }
  desktop: { enabled: boolean }
  sound: { enabled: boolean; customSoundFile?: string }
  slack: { enabled: boolean; webhookUrl: string; useMessagingChannel?: boolean }
  discord: { enabled: boolean; webhookUrl: string; useMessagingChannel?: boolean }
  pushover: { enabled: boolean; appToken: string; userKey: string }
  whatsapp: { enabled: boolean }
  telegram: { enabled: boolean }
  gmail: { enabled: boolean; googleAccountId?: string }
  _updatedAt?: number // Timestamp for optimistic locking
}

// Error class for 409 conflicts from stale updates
export class NotificationSettingsConflictError extends Error {
  public readonly current: NotificationSettings

  constructor(message: string, current: NotificationSettings) {
    super(message)
    this.name = 'NotificationSettingsConflictError'
    this.current = current
  }
}

interface NotificationTestResult {
  channel: string
  success: boolean
  error?: string
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: ['config', 'notifications'],
    queryFn: () => fetchJSON<NotificationSettings>(`${API_BASE}/api/config/notifications`),
  })
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<NotificationSettings> & { _updatedAt?: number }) => {
      const res = await fetch(`${API_BASE}/api/config/notifications`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      const body = await res.json()

      if (res.status === 409) {
        // Server rejected the update because another client changed the settings
        throw new NotificationSettingsConflictError(
          body.error || 'Settings changed by another client',
          body.current as NotificationSettings
        )
      }

      if (!res.ok) {
        throw new Error(body.error || 'Failed to update notification settings')
      }

      return body as NotificationSettings
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config', 'notifications'] })
    },
  })
}

export function useTestNotificationChannel() {
  return useMutation({
    mutationFn: (channel: 'sound' | 'slack' | 'discord' | 'pushover' | 'whatsapp' | 'telegram' | 'gmail') =>
      fetchJSON<NotificationTestResult>(`${API_BASE}/api/config/notifications/test/${channel}`, {
        method: 'POST',
      }),
  })
}

// z.ai settings types
export interface ZAiSettings {
  enabled: boolean
  apiKey: string | null
  haikuModel: string
  sonnetModel: string
  opusModel: string
}

export function useZAiSettings() {
  return useQuery({
    queryKey: ['config', 'z-ai'],
    queryFn: () => fetchJSON<ZAiSettings>(`${API_BASE}/api/config/z-ai`),
  })
}

export function useUpdateZAiSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (settings: Partial<ZAiSettings>) =>
      fetchJSON<ZAiSettings>(`${API_BASE}/api/config/z-ai`, {
        method: 'PUT',
        body: JSON.stringify(settings),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config', 'z-ai'] })
      // Also invalidate Claude usage since z.ai affects availability
      queryClient.invalidateQueries({ queryKey: ['monitoring', 'claude-usage'] })
    },
  })
}

// Developer mode types and hooks
interface DeveloperModeResponse {
  enabled: boolean
  startedAt: number
}

interface RestartResponse {
  success?: boolean
  message?: string
  error?: string
}

export function useDeveloperMode() {
  return useQuery({
    queryKey: ['config', 'developer-mode'],
    queryFn: () => fetchJSON<DeveloperModeResponse>(`${API_BASE}/api/config/developer-mode`),
    staleTime: Infinity, // Developer mode won't change during runtime
  })
}

export function useRestartFulcrum() {
  return useMutation({
    mutationFn: () =>
      fetchJSON<RestartResponse>(`${API_BASE}/api/config/restart`, {
        method: 'POST',
      }),
  })
}

interface HealthResponse {
  status: string
  version: string | null
  uptime: number
}

export function useFulcrumVersion() {
  const query = useQuery({
    queryKey: ['health'],
    queryFn: () => fetchJSON<HealthResponse>(`${API_BASE}/health`),
    staleTime: Infinity,
  })

  return {
    ...query,
    version: query.data?.version ?? null,
    uptime: query.data?.uptime ?? null,
  }
}

interface VersionCheckResponse {
  currentVersion: string | null
  latestVersion: string | null
  updateAvailable: boolean
  updateCommand: string
  releaseUrl: string
}

const VERSION_CHECK_STALE_TIME = 2 * 60 * 60 * 1000

export function useVersionCheck() {
  return useQuery({
    queryKey: ['version-check'],
    queryFn: () => fetchJSON<VersionCheckResponse>(`${API_BASE}/api/version/check`),
    staleTime: VERSION_CHECK_STALE_TIME,
    refetchOnWindowFocus: false,
  })
}

export function useRefreshVersionCheck() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => fetchJSON<VersionCheckResponse>(`${API_BASE}/api/version/check?force=1`),
    onSuccess: (data) => {
      queryClient.setQueryData(['version-check'], data)
    },
  })
}

interface UpdateResponse {
  success: boolean
  message?: string
  error?: string
  fromVersion?: string
  toVersion?: string
}

export function useTriggerUpdate() {
  return useMutation({
    mutationFn: () => fetchJSON<UpdateResponse>(`${API_BASE}/api/version/update`, { method: 'POST' }),
  })
}

// Legacy hook aliases for backward compatibility
/** @deprecated Use useEditorSshPort instead */
export const useSshPort = useEditorSshPort
