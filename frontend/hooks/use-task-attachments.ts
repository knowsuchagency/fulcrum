import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { TaskAttachment } from '@shared/types'

const API_BASE = ''

export function useTaskAttachments(taskId: string) {
  return useQuery({
    queryKey: ['task-attachments', taskId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/tasks/${taskId}/attachments`)
      if (!response.ok) {
        throw new Error('Failed to fetch attachments')
      }
      return response.json() as Promise<TaskAttachment[]>
    },
    enabled: !!taskId,
  })
}

export function useUploadAttachment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskId, file }: { taskId: string; file: File }) => {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE}/api/tasks/${taskId}/attachments`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to upload attachment')
      }

      return response.json() as Promise<TaskAttachment>
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task-attachments', variables.taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskId, attachmentId }: { taskId: string; attachmentId: string }) => {
      const response = await fetch(`${API_BASE}/api/tasks/${taskId}/attachments/${attachmentId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete attachment')
      }

      return response.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task-attachments', variables.taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function getAttachmentDownloadUrl(taskId: string, attachmentId: string): string {
  return `${API_BASE}/api/tasks/${taskId}/attachments/${attachmentId}`
}
