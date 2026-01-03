import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'
import type {
  SystemdTimer,
  SystemdTimerDetail,
  CreateTimerRequest,
  UpdateTimerRequest,
  JobLogsResponse,
  JobScope,
} from '@/types'

const API_BASE = ''

// Check if jobs feature is available on this platform
export function useJobsAvailable() {
  return useQuery({
    queryKey: ['jobs', 'available'],
    queryFn: () => fetchJSON<{ available: boolean }>(`${API_BASE}/api/jobs/available`),
    staleTime: Infinity, // Platform doesn't change, cache forever
  })
}

// Fetch all jobs/timers
export function useJobs(scope: 'all' | 'user' | 'system' = 'all') {
  return useQuery({
    queryKey: ['jobs', scope],
    queryFn: () => fetchJSON<SystemdTimer[]>(`${API_BASE}/api/jobs?scope=${scope}`),
    refetchInterval: 10000, // Refresh every 10 seconds
  })
}

// Fetch single job details
export function useJob(name: string | null, scope: JobScope = 'user') {
  return useQuery({
    queryKey: ['jobs', name, scope],
    queryFn: () => fetchJSON<SystemdTimerDetail>(`${API_BASE}/api/jobs/${name}?scope=${scope}`),
    enabled: !!name,
  })
}

// Fetch job logs
export function useJobLogs(name: string | null, scope: JobScope = 'user', lines = 100) {
  return useQuery({
    queryKey: ['jobs', name, 'logs', scope, lines],
    queryFn: () => fetchJSON<JobLogsResponse>(`${API_BASE}/api/jobs/${name}/logs?scope=${scope}&lines=${lines}`),
    enabled: !!name,
    refetchInterval: 5000, // Refresh logs every 5 seconds
  })
}

// Create new job
export function useCreateJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateTimerRequest) =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/jobs`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

// Update job
export function useUpdateJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, updates }: { name: string; updates: UpdateTimerRequest }) =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/jobs/${name}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs', name] })
    },
  })
}

// Delete job
export function useDeleteJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (name: string) =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/jobs/${name}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

// Enable job
export function useEnableJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, scope }: { name: string; scope: JobScope }) =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/jobs/${name}/enable?scope=${scope}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

// Disable job
export function useDisableJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, scope }: { name: string; scope: JobScope }) =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/jobs/${name}/disable?scope=${scope}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

// Start job timer
export function useStartJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, scope }: { name: string; scope: JobScope }) =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/jobs/${name}/start?scope=${scope}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

// Stop job timer
export function useStopJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, scope }: { name: string; scope: JobScope }) =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/jobs/${name}/stop?scope=${scope}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

// Run job now (trigger immediate execution)
export function useRunJobNow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, scope }: { name: string; scope: JobScope }) =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/jobs/${name}/run?scope=${scope}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}
