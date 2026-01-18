import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'
import type { TagWithUsage, Tag } from '@shared/types'

const API_BASE = ''

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => fetchJSON<TagWithUsage[]>(`${API_BASE}/api/tags`),
  })
}

export function useSearchTags(query: string) {
  return useQuery({
    queryKey: ['tags', 'search', query],
    queryFn: () => fetchJSON<TagWithUsage[]>(`${API_BASE}/api/tags/search?q=${encodeURIComponent(query)}&limit=10`),
    enabled: true, // Always enabled, empty query returns most used tags
  })
}

export function useFindOrCreateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, color }: { name: string; color?: string }) =>
      fetchJSON<TagWithUsage>(`${API_BASE}/api/tags/find-or-create`, {
        method: 'POST',
        body: JSON.stringify({ name, color }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

// Project-specific tag hooks
export function useAddProjectTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, tagId, name, color }: { projectId: string; tagId?: string; name?: string; color?: string }) =>
      fetchJSON<Tag>(`${API_BASE}/api/projects/${projectId}/tags`, {
        method: 'POST',
        body: JSON.stringify({ tagId, name, color }),
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

export function useRemoveProjectTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, tagId }: { projectId: string; tagId: string }) =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/projects/${projectId}/tags/${tagId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}
