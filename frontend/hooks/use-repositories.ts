import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'
import type { Repository, RepositoryWithProjects } from '@/types'

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
    queryFn: () => fetchJSON<RepositoryWithProjects>(`${API_BASE}/api/repositories/${id}`),
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

// Delete repository with options
export function useDeleteRepository() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      deleteDirectory = false,
      deleteApp = false,
    }: {
      id: string
      deleteDirectory?: boolean
      deleteApp?: boolean
    }) => {
      const params = new URLSearchParams()
      if (deleteDirectory) params.set('deleteDirectory', 'true')
      if (deleteApp) params.set('deleteApp', 'true')
      const query = params.toString()
      return fetchJSON<{ success: boolean }>(
        `${API_BASE}/api/repositories/${id}${query ? `?${query}` : ''}`,
        { method: 'DELETE' }
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositories'] })
      queryClient.invalidateQueries({ queryKey: ['apps'] })
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
