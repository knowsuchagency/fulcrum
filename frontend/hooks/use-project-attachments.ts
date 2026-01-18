import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ProjectAttachment } from '@shared/types'

const API_BASE = ''

export function useProjectAttachments(projectId: string) {
  return useQuery({
    queryKey: ['project-attachments', projectId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}/attachments`)
      if (!response.ok) {
        throw new Error('Failed to fetch attachments')
      }
      return response.json() as Promise<ProjectAttachment[]>
    },
    enabled: !!projectId,
  })
}

export function useUploadProjectAttachment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, file }: { projectId: string; file: File }) => {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE}/api/projects/${projectId}/attachments`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to upload attachment')
      }

      return response.json() as Promise<ProjectAttachment>
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-attachments', variables.projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project', variables.projectId] })
    },
  })
}

export function useDeleteProjectAttachment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, attachmentId }: { projectId: string; attachmentId: string }) => {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}/attachments/${attachmentId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete attachment')
      }

      return response.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-attachments', variables.projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project', variables.projectId] })
    },
  })
}

export function getProjectAttachmentDownloadUrl(projectId: string, attachmentId: string): string {
  return `${API_BASE}/api/projects/${projectId}/attachments/${attachmentId}`
}
