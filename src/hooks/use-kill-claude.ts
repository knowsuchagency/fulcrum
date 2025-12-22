import { useMutation } from '@tanstack/react-query'

const API_BASE = ''

interface KillClaudeResponse {
  success: boolean
  terminalsAffected: number
}

export function useKillClaudeInTask() {
  return useMutation({
    mutationFn: async (taskId: string): Promise<KillClaudeResponse> => {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/kill-claude`, {
        method: 'POST',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to kill Claude')
      }

      return res.json()
    },
  })
}
