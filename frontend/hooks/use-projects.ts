import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'
import type { ProjectWithDetails } from '@/types'

const API_BASE = ''

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => fetchJSON<ProjectWithDetails[]>(`${API_BASE}/api/projects`),
  })
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => fetchJSON<ProjectWithDetails>(`${API_BASE}/api/projects/${id}`),
    enabled: !!id,
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      name: string
      description?: string
      repositoryId: string
    }) =>
      fetchJSON<ProjectWithDetails>(`${API_BASE}/api/projects`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      // Also invalidate repositories since they may now have a project
      queryClient.invalidateQueries({ queryKey: ['repositories'] })
    },
  })
}

export function useUpdateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string
      updates: {
        name?: string
        description?: string | null
        status?: 'active' | 'archived'
      }
    }) =>
      fetchJSON<ProjectWithDetails>(`${API_BASE}/api/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects', id] })
    },
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      deleteRepository = false,
      deleteApp = false,
    }: {
      id: string
      deleteRepository?: boolean
      deleteApp?: boolean
    }) => {
      const params = new URLSearchParams()
      if (deleteRepository) params.set('deleteRepository', 'true')
      if (deleteApp) params.set('deleteApp', 'true')
      const url = `${API_BASE}/api/projects/${id}${params.toString() ? `?${params}` : ''}`
      return fetchJSON<{ success: boolean; deletedRepository: boolean; deletedApp: boolean }>(url, {
        method: 'DELETE',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['repositories'] })
      queryClient.invalidateQueries({ queryKey: ['apps'] })
    },
  })
}

export function useAddAppToProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, appId }: { projectId: string; appId: string }) =>
      fetchJSON<ProjectWithDetails>(`${API_BASE}/api/projects/${projectId}/add-app`, {
        method: 'POST',
        body: JSON.stringify({ appId }),
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
      queryClient.invalidateQueries({ queryKey: ['apps'] })
    },
  })
}

export function useRemoveAppFromProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, deleteApp = false }: { projectId: string; deleteApp?: boolean }) => {
      const url = deleteApp
        ? `${API_BASE}/api/projects/${projectId}/app?delete=true`
        : `${API_BASE}/api/projects/${projectId}/app`
      return fetchJSON<{ success: boolean; appDeleted: boolean }>(url, {
        method: 'DELETE',
      })
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
      queryClient.invalidateQueries({ queryKey: ['apps'] })
    },
  })
}

export function useAccessProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (projectId: string) =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/projects/${projectId}/access`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export interface ScannedProject {
  path: string
  name: string
  hasRepository: boolean
  hasProject: boolean
}

export interface ProjectScanResult {
  directory: string
  repositories: ScannedProject[]
}

export function useScanProjects() {
  return useMutation({
    mutationFn: (directory?: string) =>
      fetchJSON<ProjectScanResult>(`${API_BASE}/api/projects/scan`, {
        method: 'POST',
        body: JSON.stringify(directory ? { directory } : {}),
      }),
  })
}

export interface BulkCreateProjectsResult {
  created: ProjectWithDetails[]
  skipped: number
}

export function useBulkCreateProjects() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (repositories: Array<{ path: string; displayName?: string }>) =>
      fetchJSON<BulkCreateProjectsResult>(`${API_BASE}/api/projects/bulk`, {
        method: 'POST',
        body: JSON.stringify({ repositories }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['repositories'] })
    },
  })
}
