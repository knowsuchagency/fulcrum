import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Repository } from '@/types'

const API_BASE = ''

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }
  return res.json()
}

export function useRepositories() {
  return useQuery({
    queryKey: ['repositories'],
    queryFn: () => fetchJSON<Repository[]>(`${API_BASE}/api/repositories`),
  })
}

export function useRepository(id: string | null) {
  return useQuery({
    queryKey: ['repositories', id],
    queryFn: () => fetchJSON<Repository>(`${API_BASE}/api/repositories/${id}`),
    enabled: !!id,
  })
}

export function useCreateRepository() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      path: string
      displayName: string
      startupScript?: string | null
      copyFiles?: string | null
    }) =>
      fetchJSON<Repository>(`${API_BASE}/api/repositories`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositories'] })
    },
  })
}

export function useUpdateRepository() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string
      updates: Partial<Pick<Repository, 'path' | 'displayName' | 'startupScript' | 'copyFiles'>>
    }) =>
      fetchJSON<Repository>(`${API_BASE}/api/repositories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['repositories'] })
      queryClient.invalidateQueries({ queryKey: ['repositories', id] })
    },
  })
}

export function useDeleteRepository() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/repositories/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositories'] })
    },
  })
}
