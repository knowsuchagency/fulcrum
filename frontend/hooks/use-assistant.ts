import { useQuery } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'

export interface ActionableEvent {
  id: string
  sourceChannel: string
  sourceId: string
  sourceMetadata: Record<string, unknown> | null
  status: 'pending' | 'acted_upon' | 'dismissed' | 'monitoring'
  linkedTaskId: string | null
  summary: string | null
  actionLog: Array<{ timestamp: string; action: string }> | null
  createdAt: string
  updatedAt: string
  lastEvaluatedAt: string | null
}

export interface SweepRun {
  id: string
  type: 'hourly' | 'morning_ritual' | 'evening_ritual'
  startedAt: string
  completedAt: string | null
  eventsProcessed: number | null
  tasksUpdated: number | null
  messagesSent: number | null
  summary: string | null
  status: 'running' | 'completed' | 'failed'
}

export interface AssistantStats {
  events: {
    pending: number
    actedUpon: number
    dismissed: number
    monitoring: number
    total: number
  }
  lastSweeps: {
    hourly: string | null
    morningRitual: string | null
    eveningRitual: string | null
  }
}

interface EventsResponse {
  events: ActionableEvent[]
  total: number
}

interface SweepsResponse {
  runs: SweepRun[]
}

export function useActionableEvents(options?: { status?: string; channel?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams()
  if (options?.status) params.set('status', options.status)
  if (options?.channel) params.set('channel', options.channel)
  if (options?.limit) params.set('limit', String(options.limit))
  if (options?.offset) params.set('offset', String(options.offset))

  const queryString = params.toString()
  const url = `/api/assistant/events${queryString ? `?${queryString}` : ''}`

  return useQuery({
    queryKey: ['assistant', 'events', options],
    queryFn: () => fetchJSON<EventsResponse>(url),
    refetchInterval: 5000,
  })
}

export function useSweepRuns(options?: { type?: string; limit?: number }) {
  const params = new URLSearchParams()
  if (options?.type) params.set('type', options.type)
  if (options?.limit) params.set('limit', String(options.limit))

  const queryString = params.toString()
  const url = `/api/assistant/sweeps${queryString ? `?${queryString}` : ''}`

  return useQuery({
    queryKey: ['assistant', 'sweeps', options],
    queryFn: () => fetchJSON<SweepsResponse>(url),
    refetchInterval: 5000,
  })
}

export function useAssistantStats() {
  return useQuery({
    queryKey: ['assistant', 'stats'],
    queryFn: () => fetchJSON<AssistantStats>('/api/assistant/stats'),
    refetchInterval: 5000,
  })
}
