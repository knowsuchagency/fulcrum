import { useMutation } from '@tanstack/react-query'

const API_BASE = ''

interface MergeToMainRequest {
  repoPath: string
  worktreePath: string
  baseBranch?: string
}

interface MergeToMainResponse {
  success: boolean
  baseBranch: string
  mergedBranch: string
  pushed: boolean
}

interface MergeToMainError {
  error: string
  hasUncommittedChanges?: boolean
  hasConflicts?: boolean
  conflictFiles?: string[]
}

export function useGitMergeToMain() {
  return useMutation({
    mutationFn: async (data: MergeToMainRequest): Promise<MergeToMainResponse> => {
      const res = await fetch(`${API_BASE}/api/git/merge-to-main`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = (await res.json()) as MergeToMainError
        throw new Error(error.error || 'Merge failed')
      }

      return res.json()
    },
  })
}
