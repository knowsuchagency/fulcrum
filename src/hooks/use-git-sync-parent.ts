import { useMutation } from '@tanstack/react-query'

const API_BASE = ''

interface SyncParentRequest {
  repoPath: string
  baseBranch?: string
}

interface SyncParentResponse {
  success: boolean
  defaultBranch: string
  originalBranch: string
}

interface SyncParentError {
  error: string
  hasUncommittedChanges?: boolean
  hasDiverged?: boolean
  fetchFailed?: boolean
}

export function useGitSyncParent() {
  return useMutation({
    mutationFn: async (data: SyncParentRequest): Promise<SyncParentResponse> => {
      const res = await fetch(`${API_BASE}/api/git/sync-parent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = (await res.json()) as SyncParentError
        throw new Error(error.error || 'Sync parent failed')
      }

      return res.json()
    },
  })
}
