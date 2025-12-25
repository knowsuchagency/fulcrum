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
  WORKTREE_BASE_PATH: 'worktree_base_path', // Read-only, derived from VIBORA_DIR
  DEFAULT_GIT_REPOS_DIR: 'paths.defaultGitReposDir',
  BASIC_AUTH_USERNAME: 'authentication.username',
  BASIC_AUTH_PASSWORD: 'authentication.password',
  REMOTE_HOST: 'remoteVibora.host',
  REMOTE_PORT: 'remoteVibora.port',
  EDITOR_APP: 'editor.app',
  EDITOR_HOST: 'editor.host',
  EDITOR_SSH_PORT: 'editor.sshPort',
  LINEAR_API_KEY: 'integrations.linearApiKey',
  GITHUB_PAT: 'integrations.githubPat',
  LANGUAGE: 'appearance.language',
  THEME: 'appearance.theme',
  SYNC_CLAUDE_CODE_THEME: 'appearance.syncClaudeCodeTheme',
  CLAUDE_CODE_LIGHT_THEME: 'appearance.claudeCodeLightTheme',
  CLAUDE_CODE_DARK_THEME: 'appearance.claudeCodeDarkTheme',
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

// Read-only: derived from VIBORA_DIR on server
export function useWorktreeBasePath() {
  const query = useConfig(CONFIG_KEYS.WORKTREE_BASE_PATH)

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

export function useRemoteHost() {
  const query = useConfig(CONFIG_KEYS.REMOTE_HOST)

  return {
    ...query,
    data: (query.data?.value as string) ?? '',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useRemotePort() {
  const query = useConfig(CONFIG_KEYS.REMOTE_PORT)

  return {
    ...query,
    data: (query.data?.value as number) ?? DEFAULT_PORT,
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

export function useLinearApiKey() {
  const query = useConfig(CONFIG_KEYS.LINEAR_API_KEY)

  return {
    ...query,
    data: (query.data?.value as string) ?? '',
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
    data: (query.data?.value as boolean) ?? false,
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

export function useBasicAuthUsername() {
  const query = useConfig(CONFIG_KEYS.BASIC_AUTH_USERNAME)

  return {
    ...query,
    data: (query.data?.value as string) ?? '',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useBasicAuthPassword() {
  const query = useConfig(CONFIG_KEYS.BASIC_AUTH_PASSWORD)

  return {
    ...query,
    // Password is masked on the server, so we just check if it's set
    data: (query.data?.value as string) ?? '',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useUpdateConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string | number | null }) =>
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
  sound: { enabled: boolean; soundFile?: string }
  slack: { enabled: boolean; webhookUrl: string }
  discord: { enabled: boolean; webhookUrl: string }
  pushover: { enabled: boolean; appToken: string; userKey: string }
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
    mutationFn: (settings: Partial<NotificationSettings>) =>
      fetchJSON<NotificationSettings>(`${API_BASE}/api/config/notifications`, {
        method: 'PUT',
        body: JSON.stringify(settings),
      }),
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

export function useRestartVibora() {
  return useMutation({
    mutationFn: () =>
      fetchJSON<RestartResponse>(`${API_BASE}/api/config/restart`, {
        method: 'POST',
      }),
  })
}

// Legacy hook aliases for backward compatibility
/** @deprecated Use useEditorSshPort instead */
export const useSshPort = useEditorSshPort
