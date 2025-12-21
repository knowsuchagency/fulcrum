import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { WorktreesResponse } from '@/types'

const API_BASE = ''

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

export function useWorktrees() {
  return useQuery({
    queryKey: ['worktrees'],
    queryFn: () => fetchJSON<WorktreesResponse>(`${API_BASE}/api/worktrees`),
  })
}

export function useDeleteWorktree() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ worktreePath, repoPath }: { worktreePath: string; repoPath?: string }) =>
      fetchJSON<{ success: boolean; path: string }>(`${API_BASE}/api/worktrees`, {
        method: 'DELETE',
        body: JSON.stringify({ worktreePath, repoPath }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worktrees'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
