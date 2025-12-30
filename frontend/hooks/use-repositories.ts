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

export function useCreateRepository() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      path: string
      displayName: string
      startupScript?: string | null
      copyFiles?: string | null
      isCopierTemplate?: boolean
    }) =>
      fetchJSON<Repository>(`${API_BASE}/api/repositories`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositories'] })
    },
  })
}

export function useCloneRepository() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      url: string
      displayName?: string
      targetDir?: string // Parent directory for clone (defaults to defaultGitReposDir)
      folderName?: string // Custom folder name (defaults to extracted from URL)
    }) =>
      fetchJSON<Repository>(`${API_BASE}/api/repositories/clone`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositories'] })
    },
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
      updates: Partial<Pick<Repository, 'path' | 'displayName' | 'startupScript' | 'copyFiles' | 'isCopierTemplate'>>
    }) =>
      fetchJSON<Repository>(`${API_BASE}/api/repositories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['repositories'] })
      queryClient.invalidateQueries({ queryKey: ['repositories', id] })
    },
  })
}

export function useDeleteRepository() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, deleteDirectory = false }: { id: string; deleteDirectory?: boolean }) => {
      const url = deleteDirectory
        ? `${API_BASE}/api/repositories/${id}?deleteDirectory=true`
        : `${API_BASE}/api/repositories/${id}`
      return fetchJSON<{ success: boolean; directoryDeleted?: boolean }>(url, {
        method: 'DELETE',
      })
    },
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

export interface BulkCreateResult {
  created: Repository[]
  skipped: number
}

export function useBulkCreateRepositories() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (repositories: Array<{ path: string; displayName?: string }>) =>
      fetchJSON<BulkCreateResult>(`${API_BASE}/api/repositories/bulk`, {
        method: 'POST',
        body: JSON.stringify({ repositories }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositories'] })
    },
  })
}
