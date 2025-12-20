import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// Use relative URLs - works with both Vite dev proxy and production
const API_BASE = ''

interface ConfigResponse {
  key: string
  value: string | number | null
  isDefault?: boolean
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }
  return res.json()
}

// Config keys matching server
export const CONFIG_KEYS = {
  PORT: 'port',
  DATABASE_PATH: 'database_path',
  WORKTREE_BASE_PATH: 'worktree_base_path',
  DEFAULT_GIT_REPOS_DIR: 'default_git_repos_dir',
} as const

// Default values (client-side fallbacks)
const DEFAULT_PORT = 3333
const DEFAULT_DATABASE_PATH = '~/.vibora/vibora.db'
const DEFAULT_WORKTREE_BASE_PATH = '~/.vibora/worktrees'

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

export function useDatabasePath() {
  const query = useConfig(CONFIG_KEYS.DATABASE_PATH)

  return {
    ...query,
    data: (query.data?.value as string) ?? DEFAULT_DATABASE_PATH,
    isDefault: query.data?.isDefault ?? true,
  }
}

export function useWorktreeBasePath() {
  const query = useConfig(CONFIG_KEYS.WORKTREE_BASE_PATH)

  return {
    ...query,
    data: (query.data?.value as string) ?? DEFAULT_WORKTREE_BASE_PATH,
    isDefault: query.data?.isDefault ?? true,
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
