import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'
import type { Task, TaskStatus } from '@/types'

// Use relative URLs - works with both Vite dev proxy and production
const API_BASE = ''

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: () => fetchJSON<Task[]>(`${API_BASE}/api/tasks`),
  })
}

export function useTask(taskId: string) {
  return useQuery({
    queryKey: ['tasks', taskId],
    queryFn: () => fetchJSON<Task>(`${API_BASE}/api/tasks/${taskId}`),
    enabled: !!taskId,
  })
}

export function useCreateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      title: string
      description: string
      repoPath: string
      repoName: string
      baseBranch: string
      branch: string
      worktreePath: string
      prUrl?: string | null
      copyFiles?: string
      startupScript?: string
    }) =>
      fetchJSON<Task>(`${API_BASE}/api/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          status: 'IN_PROGRESS',
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      taskId,
      status,
      position,
    }: {
      taskId: string
      status: TaskStatus
      position: number
    }) =>
      fetchJSON<Task>(`${API_BASE}/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, position }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useUpdateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      taskId,
      updates,
    }: {
      taskId: string
      updates: Partial<Pick<Task, 'title' | 'description' | 'status' | 'viewState' | 'prUrl' | 'linearTicketId' | 'linearTicketUrl'>>
    }) =>
      fetchJSON<Task>(`${API_BASE}/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId] })
    },
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      taskId,
      deleteLinkedWorktree,
    }: {
      taskId: string
      deleteLinkedWorktree?: boolean
    }) => {
      const url = deleteLinkedWorktree
        ? `${API_BASE}/api/tasks/${taskId}?deleteLinkedWorktree=true`
        : `${API_BASE}/api/tasks/${taskId}`
      return fetchJSON<{ success: boolean }>(url, {
        method: 'DELETE',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['worktrees'] })
    },
  })
}

export function useBulkDeleteTasks() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      ids,
      deleteLinkedWorktrees,
    }: {
      ids: string[]
      deleteLinkedWorktrees?: boolean
    }) =>
      fetchJSON<{ success: boolean; deleted: number }>(`${API_BASE}/api/tasks/bulk`, {
        method: 'DELETE',
        body: JSON.stringify({ ids, deleteLinkedWorktrees }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['worktrees'] })
    },
  })
}
