import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'

// Use relative URLs - works with both Vite dev proxy and production
const API_BASE = ''

interface ConfigResponse {
  key: string
  value: string | number | null
  isDefault?: boolean
}

// Config keys using dot-notation for nested settings
export const CONFIG_KEYS = {
  PORT: 'server.port',
  WORKTREE_BASE_PATH: 'worktree_base_path', // Read-only, derived from FULCRUM_DIR
  HOME_DIR: 'home_dir', // Read-only, system home directory
  DEFAULT_GIT_REPOS_DIR: 'paths.defaultGitReposDir',
  EDITOR_APP: 'editor.app',
  EDITOR_HOST: 'editor.host',
  EDITOR_SSH_PORT: 'editor.sshPort',
  GITHUB_PAT: 'integrations.githubPat',
  DEFAULT_AGENT: 'agent.defaultAgent',
  OPENCODE_MODEL: 'agent.opencodeModel',
  OPENCODE_DEFAULT_AGENT: 'agent.opencodeDefaultAgent',
  OPENCODE_PLAN_AGENT: 'agent.opencodePlanAgent',
  LANGUAGE: 'appearance.language',
  THEME: 'appearance.theme',
  SYNC_CLAUDE_CODE_THEME: 'appearance.syncClaudeCodeTheme',
  CLAUDE_CODE_LIGHT_THEME: 'appearance.claudeCodeLightTheme',
  CLAUDE_CODE_DARK_THEME: 'appearance.claudeCodeDarkTheme',
  DEFAULT_TASK_TYPE: 'tasks.defaultTaskType',
  START_WORKTREE_TASKS_IMMEDIATELY: 'tasks.startWorktreeTasksImmediately',
} as const

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
export type TaskType = 'worktree' | 'non-worktree'

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

/** @deprecated Use useStartWorktreeTasksImmediately instead */
export const useStartCodeTasksImmediately = useStartWorktreeTasksImmediately

export function useUpdateConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string | number | boolean | null }) =>
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
  slack: { enabled: boolean; webhookUrl: string }
  discord: { enabled: boolean; webhookUrl: string }
  pushover: { enabled: boolean; appToken: string; userKey: string }
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
    mutationFn: (channel: 'sound' | 'slack' | 'discord' | 'pushover') =>
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

// Legacy hook aliases for backward compatibility
/** @deprecated Use useEditorSshPort instead */
export const useSshPort = useEditorSshPort
