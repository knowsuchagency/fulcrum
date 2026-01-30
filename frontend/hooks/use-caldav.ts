/**
 * React Query hooks for CalDAV calendar integration
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'

const API_BASE = ''

// Types
export interface CaldavStatus {
  connected: boolean
  syncing: boolean
  lastError: string | null
  calendarCount: number
}

export interface CaldavCalendar {
  id: string
  remoteUrl: string
  displayName: string | null
  color: string | null
  enabled: boolean | null
  lastSyncedAt: string | null
}

export interface CaldavEvent {
  id: string
  calendarId: string
  summary: string | null
  dtstart: string | null
  dtend: string | null
  allDay: boolean | null
  location: string | null
  description: string | null
}

export interface TestConnectionResult {
  success: boolean
  calendars?: number
  error?: string
}

// Status
export function useCaldavStatus() {
  return useQuery({
    queryKey: ['caldav', 'status'],
    queryFn: () => fetchJSON<CaldavStatus>(`${API_BASE}/api/caldav/status`),
    refetchInterval: 30000,
  })
}

// Calendars
export function useCaldavCalendars() {
  return useQuery({
    queryKey: ['caldav', 'calendars'],
    queryFn: () => fetchJSON<CaldavCalendar[]>(`${API_BASE}/api/caldav/calendars`),
  })
}

// Test connection
export function useTestCaldavConnection() {
  return useMutation({
    mutationFn: (config: { serverUrl: string; username: string; password: string }) =>
      fetchJSON<TestConnectionResult>(`${API_BASE}/api/caldav/test`, {
        method: 'POST',
        body: JSON.stringify(config),
      }),
  })
}

// Configure (save + connect)
export function useConfigureCaldav() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (config: {
      serverUrl: string
      username: string
      password: string
      syncIntervalMinutes?: number
    }) =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/caldav/configure`, {
        method: 'POST',
        body: JSON.stringify(config),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caldav'] })
      queryClient.invalidateQueries({ queryKey: ['config'] })
    },
  })
}

// Enable
export function useEnableCaldav() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/caldav/enable`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caldav'] })
      queryClient.invalidateQueries({ queryKey: ['config', 'caldav.enabled'] })
    },
  })
}

// Disable
export function useDisableCaldav() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/caldav/disable`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caldav'] })
      queryClient.invalidateQueries({ queryKey: ['config', 'caldav.enabled'] })
    },
  })
}

// Configure Google OAuth credentials
export function useConfigureGoogleCaldav() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (config: {
      googleClientId: string
      googleClientSecret: string
      syncIntervalMinutes?: number
    }) =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/caldav/configure-google`, {
        method: 'POST',
        body: JSON.stringify(config),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caldav'] })
      queryClient.invalidateQueries({ queryKey: ['config'] })
    },
  })
}

// Get Google OAuth authorization URL
export function useGetGoogleAuthUrl() {
  return useMutation({
    mutationFn: () =>
      fetchJSON<{ authUrl: string }>(`${API_BASE}/api/caldav/oauth/authorize`),
  })
}

// Manual sync
export function useSyncCaldav() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/caldav/sync`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caldav'] })
    },
  })
}
