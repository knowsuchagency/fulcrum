import { useMutation } from '@tanstack/react-query'

const API_BASE = ''

interface SyncRequest {
  repoPath: string
  worktreePath: string
  baseBranch?: string
}

interface SyncResponse {
  success: boolean
  worktreeRebased: boolean
  defaultBranch: string
}

interface SyncError {
  error: string
  hasUncommittedChanges?: boolean
  conflictAborted?: boolean
}

export function useGitSync() {
  return useMutation({
    mutationFn: async (data: SyncRequest): Promise<SyncResponse> => {
      const res = await fetch(`${API_BASE}/api/git/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = (await res.json()) as SyncError
        throw new Error(error.error || 'Sync failed')
      }

      return res.json()
    },
  })
}
