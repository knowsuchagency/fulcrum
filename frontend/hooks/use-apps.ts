import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'
import type { App, AppService, Deployment, ParsedComposeFile, ContainerStatus } from '@/types'

const API_BASE = ''

// App types with services
export interface AppWithServices extends App {
  services: AppService[]
  repository?: {
    id: string
    path: string
    displayName: string
  }
}

// Fetch all apps
export function useApps() {
  return useQuery({
    queryKey: ['apps'],
    queryFn: () => fetchJSON<AppWithServices[]>(`${API_BASE}/api/apps`),
  })
}

// Fetch single app
export function useApp(id: string | null) {
  return useQuery({
    queryKey: ['apps', id],
    queryFn: () => fetchJSON<AppWithServices>(`${API_BASE}/api/apps/${id}`),
    enabled: !!id,
  })
}

// Create app
export function useCreateApp() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      name: string
      repositoryId: string
      branch?: string
      composeFile?: string
      autoDeployEnabled?: boolean
      services: Array<{
        serviceName: string
        containerPort?: number
        exposed: boolean
        domain?: string
      }>
    }) =>
      fetchJSON<AppWithServices>(`${API_BASE}/api/apps`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] })
    },
  })
}

// Update app
export function useUpdateApp() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string
      updates: {
        name?: string
        branch?: string
        autoDeployEnabled?: boolean
        environmentVariables?: Record<string, string>
        noCacheBuild?: boolean
        services?: Array<{
          id?: string
          serviceName: string
          containerPort?: number
          exposed: boolean
          domain?: string
        }>
      }
    }) =>
      fetchJSON<AppWithServices>(`${API_BASE}/api/apps/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['apps'] })
      queryClient.invalidateQueries({ queryKey: ['apps', id] })
    },
  })
}

// Delete app
export function useDeleteApp() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, stopContainers = true }: { id: string; stopContainers?: boolean }) => {
      const url = stopContainers
        ? `${API_BASE}/api/apps/${id}`
        : `${API_BASE}/api/apps/${id}?stopContainers=false`
      return fetchJSON<{ success: boolean }>(url, { method: 'DELETE' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] })
    },
  })
}

// Deploy app
export function useDeployApp() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      fetchJSON<{ success: boolean; deployment: Deployment }>(`${API_BASE}/api/apps/${id}/deploy`, {
        method: 'POST',
      }),
    // Use onSettled to invalidate queries regardless of success/failure
    // This ensures failed deployments are shown in the deployments list
    onSettled: (_, __, id) => {
      queryClient.invalidateQueries({ queryKey: ['apps'] })
      queryClient.invalidateQueries({ queryKey: ['apps', id] })
      queryClient.invalidateQueries({ queryKey: ['apps', id, 'deployments'] })
    },
  })
}

// Stop app
export function useStopApp() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/apps/${id}/stop`, {
        method: 'POST',
      }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['apps'] })
      queryClient.invalidateQueries({ queryKey: ['apps', id] })
    },
  })
}

// Get app logs
export function useAppLogs(appId: string | null, service?: string, tail = 100) {
  return useQuery({
    queryKey: ['apps', appId, 'logs', service, tail],
    queryFn: () => {
      const params = new URLSearchParams()
      if (service) params.set('service', service)
      params.set('tail', String(tail))
      return fetchJSON<{ logs: string }>(`${API_BASE}/api/apps/${appId}/logs?${params}`)
    },
    enabled: !!appId,
    refetchInterval: 5000, // Refresh logs every 5 seconds
  })
}

// Get app container status
export function useAppStatus(appId: string | null) {
  return useQuery({
    queryKey: ['apps', appId, 'status'],
    queryFn: () =>
      fetchJSON<{ containers: ContainerStatus[] }>(`${API_BASE}/api/apps/${appId}/status`),
    enabled: !!appId,
    refetchInterval: 10000, // Refresh status every 10 seconds
  })
}

// Get deployment history
export function useDeployments(appId: string | null) {
  return useQuery({
    queryKey: ['apps', appId, 'deployments'],
    queryFn: () => fetchJSON<Deployment[]>(`${API_BASE}/api/apps/${appId}/deployments`),
    enabled: !!appId,
  })
}

// Rollback to deployment
export function useRollbackApp() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ appId, deploymentId }: { appId: string; deploymentId: string }) =>
      fetchJSON<{ success: boolean; deployment: Deployment }>(
        `${API_BASE}/api/apps/${appId}/rollback/${deploymentId}`,
        { method: 'POST' }
      ),
    onSuccess: (_, { appId }) => {
      queryClient.invalidateQueries({ queryKey: ['apps'] })
      queryClient.invalidateQueries({ queryKey: ['apps', appId] })
      queryClient.invalidateQueries({ queryKey: ['apps', appId, 'deployments'] })
    },
  })
}

// Parse compose file
export function useParseCompose(repoId: string | null) {
  return useQuery({
    queryKey: ['compose', 'parse', repoId],
    queryFn: () => fetchJSON<ParsedComposeFile>(`${API_BASE}/api/compose/parse?repoId=${repoId}`),
    enabled: !!repoId,
  })
}

// Find compose file
export function useFindCompose(repoId: string | null) {
  return useQuery({
    queryKey: ['compose', 'find', repoId],
    queryFn: () =>
      fetchJSON<{ found: boolean; file: string | null }>(`${API_BASE}/api/compose/find?repoId=${repoId}`),
    enabled: !!repoId,
  })
}

// Read compose file content
export function useComposeFile(repoPath: string | null, composeFile: string | null) {
  return useQuery({
    queryKey: ['compose', 'file', repoPath, composeFile],
    queryFn: () =>
      fetchJSON<{ content: string; mimeType: string; size: number }>(
        `${API_BASE}/api/fs/read?path=${encodeURIComponent(composeFile!)}&root=${encodeURIComponent(repoPath!)}`
      ),
    enabled: !!repoPath && !!composeFile,
  })
}

// Write compose file content
export function useWriteComposeFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ repoPath, composeFile, content }: { repoPath: string; composeFile: string; content: string }) =>
      fetchJSON<{ success: boolean; size: number }>(`${API_BASE}/api/fs/write`, {
        method: 'POST',
        body: JSON.stringify({ path: composeFile, root: repoPath, content }),
      }),
    onSuccess: (_, { repoPath, composeFile }) => {
      queryClient.invalidateQueries({ queryKey: ['compose', 'file', repoPath, composeFile] })
    },
  })
}

// Find app by repository ID
export function useAppByRepository(repositoryId: string | null) {
  const { data: apps } = useApps()
  return apps?.find((app) => app.repository?.id === repositoryId) ?? null
}
