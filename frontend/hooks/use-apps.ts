import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback, useRef } from 'react'
import { fetchJSON } from '@/lib/api'
import type { App, AppService, Deployment, ParsedComposeFile, ContainerStatus } from '@/types'

export type DeploymentStage = 'pulling' | 'building' | 'starting' | 'configuring' | 'done' | 'failed' | 'cancelled'

export interface DeploymentProgress {
  stage: DeploymentStage
  message: string
  progress?: number
}

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
        notificationsEnabled?: boolean
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

// Deploy app (non-streaming)
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

// Deploy app with SSE streaming for real-time logs
export function useDeployAppStream() {
  const queryClient = useQueryClient()
  const [isDeploying, setIsDeploying] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [stage, setStage] = useState<DeploymentStage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deployment, setDeployment] = useState<Deployment | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const deploy = useCallback(
    (id: string) => {
      // Reset state
      setIsDeploying(true)
      setLogs([])
      setStage(null)
      setError(null)
      setDeployment(null)

      // Close any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }

      // Create EventSource for SSE
      const eventSource = new EventSource(`${API_BASE}/api/apps/${id}/deploy/stream`)
      eventSourceRef.current = eventSource

      eventSource.addEventListener('progress', (e) => {
        const progress = JSON.parse(e.data) as DeploymentProgress
        setStage(progress.stage)
        setLogs((prev) => [...prev, progress.message])
      })

      eventSource.addEventListener('complete', (e) => {
        const result = JSON.parse(e.data) as { success: boolean; deployment: Deployment }
        setDeployment(result.deployment)
        setIsDeploying(false)
        eventSource.close()

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['apps'] })
        queryClient.invalidateQueries({ queryKey: ['apps', id] })
        queryClient.invalidateQueries({ queryKey: ['apps', id, 'deployments'] })
      })

      eventSource.addEventListener('error', (e) => {
        if (e instanceof MessageEvent) {
          const result = JSON.parse(e.data) as { success: boolean; error: string }
          setError(result.error)
        } else {
          setError('Connection lost during deployment')
        }
        setIsDeploying(false)
        eventSource.close()

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['apps'] })
        queryClient.invalidateQueries({ queryKey: ['apps', id] })
        queryClient.invalidateQueries({ queryKey: ['apps', id, 'deployments'] })
      })

      eventSource.onerror = () => {
        // Only set error if we're still deploying (not already handled by error event)
        if (isDeploying) {
          setError('Connection lost during deployment')
          setIsDeploying(false)
        }
        eventSource.close()
      }
    },
    [queryClient, isDeploying]
  )

  const reset = useCallback(() => {
    setIsDeploying(false)
    setLogs([])
    setStage(null)
    setError(null)
    setDeployment(null)
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  return {
    deploy,
    reset,
    isDeploying,
    logs,
    stage,
    error,
    deployment,
  }
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

// Cancel deployment
export function useCancelDeployment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/apps/${id}/cancel-deploy`, {
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

// Sync services from compose file (updates ports, adds new services)
export function useSyncServices() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (appId: string) =>
      fetchJSON<{ success: boolean; services: Array<{ serviceName: string; containerPort: number | null; exposed: boolean; domain: string | null }> }>(
        `${API_BASE}/api/apps/${appId}/sync-services`,
        { method: 'POST' }
      ),
    onSuccess: (_, appId) => {
      queryClient.invalidateQueries({ queryKey: ['apps', appId] })
      queryClient.invalidateQueries({ queryKey: ['apps'] })
    },
  })
}

// Find app by repository ID
export function useAppByRepository(repositoryId: string | null) {
  const { data: apps } = useApps()
  return apps?.find((app) => app.repository?.id === repositoryId) ?? null
}

// Deployment prerequisites
export interface DeploymentPrerequisites {
  docker: {
    installed: boolean
    running: boolean
    version: string | null
  }
  traefik: {
    detected: boolean
    type: 'dokploy' | 'vibora' | 'other' | 'none'
    containerName: string | null
    configDir: string | null
    network: string | null
    configWritable: boolean
  }
  settings: {
    cloudflareConfigured: boolean
  }
  ready: boolean
}

export function useDeploymentPrerequisites() {
  return useQuery({
    queryKey: ['deployment', 'prerequisites'],
    queryFn: () => fetchJSON<DeploymentPrerequisites>(`${API_BASE}/api/deployment/prerequisites`),
    staleTime: 10000, // Cache for 10 seconds
  })
}

// Start Traefik container (only for Vibora's own Traefik, not external)
export function useStartTraefik() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      fetchJSON<{ success: boolean; status: string; containerName: string; network: string }>(
        `${API_BASE}/api/deployment/traefik/start`,
        { method: 'POST' }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployment', 'prerequisites'] })
    },
  })
}

// Stop Traefik container (only Vibora's own Traefik)
export function useStopTraefik() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/deployment/traefik/stop`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployment', 'prerequisites'] })
    },
  })
}

// Detect public IP
export function useDetectPublicIp() {
  return useMutation({
    mutationFn: () => fetchJSON<{ success: boolean; ip: string }>(`${API_BASE}/api/deployment/detect-ip`),
  })
}

// Get deployment settings
export interface DeploymentSettings {
  cloudflareApiToken: string | null
  cloudflareConfigured: boolean
}

export function useDeploymentSettings() {
  return useQuery({
    queryKey: ['deployment', 'settings'],
    queryFn: () => fetchJSON<DeploymentSettings>(`${API_BASE}/api/deployment/settings`),
  })
}

// Update deployment settings
export function useUpdateDeploymentSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      cloudflareApiToken?: string | null
    }) =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/deployment/settings`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployment', 'settings'] })
      queryClient.invalidateQueries({ queryKey: ['deployment', 'prerequisites'] })
    },
  })
}
