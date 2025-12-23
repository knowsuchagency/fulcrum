import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'

// Use relative URLs - works with both Vite dev proxy and production
const API_BASE = ''

interface ConfigResponse {
  key: string
  value: string | number | null
  isDefault?: boolean
}

// Config keys matching server
export const CONFIG_KEYS = {
  PORT: 'port',
  WORKTREE_BASE_PATH: 'worktree_base_path', // Read-only, derived from VIBORA_DIR
  DEFAULT_GIT_REPOS_DIR: 'default_git_repos_dir',
  TASK_CREATION_COMMAND: 'task_creation_command',
  HOSTNAME: 'hostname',
  SSH_PORT: 'ssh_port',
  LINEAR_API_KEY: 'linear_api_key',
  GITHUB_PAT: 'github_pat',
  LANGUAGE: 'language',
} as const

// Default values (client-side fallbacks)
const DEFAULT_PORT = 3333
const DEFAULT_TASK_CREATION_COMMAND = 'claude --dangerously-skip-permissions'

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

export function useTaskCreationCommand() {
  const query = useConfig(CONFIG_KEYS.TASK_CREATION_COMMAND)

  return {
    ...query,
    data: (query.data?.value as string) ?? DEFAULT_TASK_CREATION_COMMAND,
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useHostname() {
  const query = useConfig(CONFIG_KEYS.HOSTNAME)

  return {
    ...query,
    data: (query.data?.value as string) ?? '',
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useSshPort() {
  const query = useConfig(CONFIG_KEYS.SSH_PORT)

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

export function useUpdateConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string | number }) =>
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
