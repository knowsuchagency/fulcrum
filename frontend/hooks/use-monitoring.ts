import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'
import type { AgentType } from '@shared/types'

const API_BASE = ''

export type TimeWindow = '1m' | '10m' | '1h' | '3h' | '6h' | '12h' | '24h'
export type ClaudeFilter = 'vibora' | 'all'

export interface ClaudeInstance {
  pid: number
  agent: AgentType
  cwd: string
  ramMB: number
  startedAt: number | null
  terminalId: string | null
  terminalName: string | null
  taskId: string | null
  taskTitle: string | null
  worktreePath: string | null
  isViboraManaged: boolean
}

export interface SystemMetric {
  timestamp: number
  cpuPercent: number
  memoryUsedPercent: number
  memoryCachePercent: number
  diskUsedPercent: number
}

export interface SystemMetricsResponse {
  window: string
  dataPoints: SystemMetric[]
  current: {
    cpu: number
    memory: { total: number; used: number; cache: number; usedPercent: number; cachePercent: number }
    disk: { total: number; used: number; usedPercent: number; path: string }
  }
}

export function useClaudeInstances(filter: ClaudeFilter = 'vibora') {
  return useQuery({
    queryKey: ['monitoring', 'claude-instances', filter],
    queryFn: () =>
      fetchJSON<ClaudeInstance[]>(`${API_BASE}/api/monitoring/claude-instances?filter=${filter}`),
    refetchInterval: 5000, // Refresh every 5 seconds
  })
}

export function useSystemMetrics(window: TimeWindow = '1h') {
  return useQuery({
    queryKey: ['monitoring', 'system-metrics', window],
    queryFn: () =>
      fetchJSON<SystemMetricsResponse>(`${API_BASE}/api/monitoring/system-metrics?window=${window}`),
    refetchInterval: 5000, // Refresh every 5 seconds (matches collector interval)
  })
}

export function useKillClaudeInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ terminalId, pid }: { terminalId?: string | null; pid?: number }) => {
      if (terminalId) {
        // Kill via terminal (Vibora-managed)
        return fetchJSON<{ success: boolean; killed: boolean }>(
          `${API_BASE}/api/monitoring/claude-instances/${terminalId}/kill`,
          { method: 'POST' }
        )
      } else if (pid) {
        // Kill by PID (external process)
        return fetchJSON<{ success: boolean; killed: boolean }>(
          `${API_BASE}/api/monitoring/claude-instances/${pid}/kill-pid`,
          { method: 'POST' }
        )
      }
      throw new Error('Either terminalId or pid must be provided')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitoring', 'claude-instances'] })
    },
  })
}

// Helper to format bytes to human-readable string
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// Helper to format time window for display
export function formatTimeWindow(window: TimeWindow): string {
  const labels: Record<TimeWindow, string> = {
    '1m': '1 min',
    '10m': '10 min',
    '1h': '1 hour',
    '3h': '3 hours',
    '6h': '6 hours',
    '12h': '12 hours',
    '24h': '24 hours',
  }
  return labels[window]
}

// Top processes types and hook
export interface TopProcess {
  pid: number
  name: string
  command: string
  cpuPercent: number
  memoryMB: number
  memoryPercent: number
}

export type ProcessSortBy = 'memory' | 'cpu'

export function useTopProcesses(sortBy: ProcessSortBy = 'memory', limit: number = 10) {
  return useQuery({
    queryKey: ['monitoring', 'top-processes', sortBy, limit],
    queryFn: () =>
      fetchJSON<TopProcess[]>(`${API_BASE}/api/monitoring/top-processes?sort=${sortBy}&limit=${limit}`),
    refetchInterval: 5000,
  })
}

// Docker container stats types and hook
export interface ContainerStats {
  id: string
  name: string
  cpuPercent: number
  memoryMB: number
  memoryLimit: number
  memoryPercent: number
}

export interface DockerStatsResponse {
  containers: ContainerStats[]
  available: boolean
  runtime: 'docker' | 'podman' | null
}

export function useDockerStats() {
  return useQuery({
    queryKey: ['monitoring', 'docker-stats'],
    queryFn: () => fetchJSON<DockerStatsResponse>(`${API_BASE}/api/monitoring/docker-stats`),
    refetchInterval: 5000,
  })
}

// Vibora instances types and hooks
export interface ViboraInstanceGroup {
  viboraDir: string
  port: number
  mode: 'development' | 'production'
  backend: { pid: number; memoryMB: number; startedAt: number | null } | null
  frontend: { pid: number; memoryMB: number; startedAt: number | null } | null
  totalMemoryMB: number
}

export function useViboraInstances() {
  return useQuery({
    queryKey: ['monitoring', 'vibora-instances'],
    queryFn: () => fetchJSON<ViboraInstanceGroup[]>(`${API_BASE}/api/monitoring/vibora-instances`),
    refetchInterval: 5000,
  })
}

export function useKillViboraInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ backendPid }: { backendPid: number }) =>
      fetchJSON<{ success: boolean; killed: number[]; viboraDir: string; port: number }>(
        `${API_BASE}/api/monitoring/vibora-instances/${backendPid}/kill`,
        { method: 'POST' }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitoring', 'vibora-instances'] })
    },
  })
}

// Claude Code Usage Limits types and hook
interface UsageBlock {
  percentUsed: number
  resetAt: string
  isOverLimit: boolean
}

export interface ClaudeUsageResponse {
  available: boolean
  fiveHour: (UsageBlock & { timeRemainingMinutes: number }) | null
  sevenDay: (UsageBlock & { weekProgressPercent: number }) | null
  sevenDayOpus: UsageBlock | null
  sevenDaySonnet: UsageBlock | null
  error?: string
}

export function useClaudeUsage() {
  return useQuery({
    queryKey: ['monitoring', 'claude-usage'],
    queryFn: () => fetchJSON<ClaudeUsageResponse>(`${API_BASE}/api/monitoring/claude-usage`),
    refetchInterval: 5000, // Refresh every 5 seconds
  })
}
