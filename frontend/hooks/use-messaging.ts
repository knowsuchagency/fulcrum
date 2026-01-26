/**
 * React Query hooks for messaging channels (WhatsApp, etc.)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { MessagingConnection, MessagingSessionMapping, MessagingConnectionStatus } from '@/types'

// API base URL
const API_BASE = '/api/messaging'

export interface WhatsAppStatus extends Partial<MessagingConnection> {
  enabled: boolean
  status: MessagingConnectionStatus
}

// Get all messaging channels
export function useMessagingChannels() {
  return useQuery({
    queryKey: ['messaging', 'channels'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/channels`)
      if (!res.ok) throw new Error('Failed to fetch channels')
      const data = await res.json()
      return data.channels as MessagingConnection[]
    },
  })
}

// Get WhatsApp status
export function useWhatsAppStatus() {
  return useQuery({
    queryKey: ['messaging', 'whatsapp'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/whatsapp`)
      if (!res.ok) throw new Error('Failed to fetch WhatsApp status')
      return (await res.json()) as WhatsAppStatus
    },
    refetchInterval: 5000, // Poll status every 5s
  })
}

// Enable WhatsApp
export function useEnableWhatsApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/whatsapp/enable`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to enable WhatsApp')
      return (await res.json()) as MessagingConnection
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messaging'] })
    },
  })
}

// Disable WhatsApp
export function useDisableWhatsApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/whatsapp/disable`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to disable WhatsApp')
      return (await res.json()) as MessagingConnection
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messaging'] })
    },
  })
}

// Request WhatsApp QR code
export function useRequestWhatsAppAuth() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/whatsapp/auth`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to request WhatsApp auth')
      return (await res.json()) as { qrDataUrl: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messaging', 'whatsapp'] })
    },
  })
}

// Disconnect WhatsApp (logout and clear auth)
export function useDisconnectWhatsApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/whatsapp/disconnect`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to disconnect WhatsApp')
      return (await res.json()) as MessagingConnection
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messaging'] })
    },
  })
}

// Get WhatsApp sessions
export function useWhatsAppSessions() {
  return useQuery({
    queryKey: ['messaging', 'whatsapp', 'sessions'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/whatsapp/sessions`)
      if (!res.ok) throw new Error('Failed to fetch WhatsApp sessions')
      const data = await res.json()
      return data.sessions as MessagingSessionMapping[]
    },
  })
}
