import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'
import type { Repository } from '@/types'

const API_BASE = ''

export function useRepositories() {
  return useQuery({
    queryKey: ['repositories'],
    queryFn: () => fetchJSON<Repository[]>(`${API_BASE}/api/repositories`),
  })
}

export function useRepository(id: string | null) {
  return useQuery({
    queryKey: ['repositories', id],
    queryFn: () => fetchJSON<Repository>(`${API_BASE}/api/repositories/${id}`),
    enabled: !!id,
  })
}

export function useUpdateRepository() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string
      updates: Partial<Pick<Repository, 'path' | 'displayName' | 'startupScript' | 'copyFiles' | 'claudeOptions' | 'opencodeOptions' | 'opencodeModel' | 'defaultAgent' | 'isCopierTemplate'>>
    }) =>
      fetchJSON<Repository>(`${API_BASE}/api/repositories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['repositories'] })
      queryClient.invalidateQueries({ queryKey: ['repositories', id] })
      // Also invalidate projects since they may display repository info
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

// Note: Repository deletion is only allowed for orphaned repositories (not linked to any project).
// Use DELETE /api/projects/:id to delete a project and its repository together.
export function useDeleteRepository() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/repositories/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositories'] })
    },
  })
}

export interface ScannedRepository {
  path: string
  name: string
  exists: boolean
}

export interface ScanResult {
  directory: string
  repositories: ScannedRepository[]
}

export function useScanRepositories() {
  return useMutation({
    mutationFn: (directory?: string) =>
      fetchJSON<ScanResult>(`${API_BASE}/api/repositories/scan`, {
        method: 'POST',
        body: JSON.stringify(directory ? { directory } : {}),
      }),
  })
}
