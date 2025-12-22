import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'

const API_BASE = ''

export type TimeWindow = '1m' | '10m' | '1h' | '3h' | '6h' | '12h' | '24h'
export type ClaudeFilter = 'vibora' | 'all'

export interface ClaudeInstance {
  pid: number
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
  diskUsedPercent: number
}

export interface SystemMetricsResponse {
  window: string
  dataPoints: SystemMetric[]
  current: {
    cpu: number
    memory: { total: number; used: number; usedPercent: number }
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
