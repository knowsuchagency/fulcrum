import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'
import type { ProjectWithDetails, ProjectLink } from '@/types'

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
      tags?: string[]
      // Optional - for backwards compatibility
      repositoryId?: string
      path?: string
      url?: string
      targetDir?: string
      folderName?: string
    }) =>
      fetchJSON<ProjectWithDetails>(`${API_BASE}/api/projects`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['repositories'] })
    },
  })
}

// Repository conflict response type
export interface RepositoryConflict {
  error: string
  conflictProject?: { id: string; name: string } | null
}

// Add repository to project result
export interface AddRepositoryResult {
  id: string
  projectId: string
  repositoryId: string
  isPrimary: boolean
  createdAt: string
  repository: {
    id: string
    path: string
    displayName: string
  }
}

export function useAddRepositoryToProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      ...data
    }: {
      projectId: string
      // Option 1: Link existing repository
      repositoryId?: string
      // Option 2: Create from local path
      path?: string
      // Option 3: Clone from URL
      url?: string
      targetDir?: string
      folderName?: string
      // Common options
      isPrimary?: boolean
      moveFromProject?: boolean
    }) => {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}/repositories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await response.json()
      if (!response.ok) {
        // Return special conflict response for 409
        if (response.status === 409) {
          const err = new Error(result.error) as Error & { conflict?: RepositoryConflict }
          err.conflict = result as RepositoryConflict
          throw err
        }
        throw new Error(result.error || 'Failed to add repository')
      }
      return result as AddRepositoryResult
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
      queryClient.invalidateQueries({ queryKey: ['repositories'] })
    },
  })
}

export function useRemoveRepositoryFromProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      repositoryId,
      deleteRecord = false,
    }: {
      projectId: string
      repositoryId: string
      deleteRecord?: boolean
    }) => {
      const params = deleteRecord ? '?deleteRecord=true' : ''
      return fetchJSON<{ success: boolean; deleted: boolean }>(
        `${API_BASE}/api/projects/${projectId}/repositories/${repositoryId}${params}`,
        { method: 'DELETE' }
      )
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
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
        notes?: string | null
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
      const url = `${API_BASE}/api/projects/${id}${params.toString() ? `?${params}` : ''}`
      return fetchJSON<{ success: boolean; deletedDirectory: boolean; deletedApp: boolean }>(url, {
        method: 'DELETE',
      })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['repositories'] }),
        queryClient.invalidateQueries({ queryKey: ['apps'] }),
      ])
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

export function useCreateAppForProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      projectId,
      name,
      branch,
      composeFile,
      autoDeployEnabled,
      services,
    }: {
      projectId: string
      name?: string
      branch?: string
      composeFile?: string
      autoDeployEnabled?: boolean
      services?: Array<{
        serviceName: string
        containerPort?: number
        exposed: boolean
        domain?: string
        exposureMethod?: 'dns' | 'tunnel'
      }>
    }) =>
      fetchJSON<ProjectWithDetails>(`${API_BASE}/api/projects/${projectId}/create-app`, {
        method: 'POST',
        body: JSON.stringify({ name, branch, composeFile, autoDeployEnabled, services }),
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

// Project links
export function useAddProjectLink() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      projectId,
      url,
      label,
    }: {
      projectId: string
      url: string
      label?: string
    }) =>
      fetchJSON<ProjectLink>(`${API_BASE}/api/projects/${projectId}/links`, {
        method: 'POST',
        body: JSON.stringify({ url, label }),
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
    },
  })
}

export function useRemoveProjectLink() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, linkId }: { projectId: string; linkId: string }) =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/projects/${projectId}/links/${linkId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
    },
  })
}
