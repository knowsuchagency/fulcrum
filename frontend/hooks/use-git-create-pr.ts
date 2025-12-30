import { useMutation } from '@tanstack/react-query'

const API_BASE = ''

interface GitCreatePRRequest {
  worktreePath: string
  title: string
  baseBranch?: string
}

interface GitCreatePRResponse {
  success: boolean
  prUrl: string
  branch: string
}

interface GitCreatePRError {
  error: string
  hasUncommittedChanges?: boolean
  branchNotPushed?: boolean
  notAuthenticated?: boolean
  prAlreadyExists?: boolean
  existingPrUrl?: string
}

export function useGitCreatePR() {
  return useMutation({
    mutationFn: async (data: GitCreatePRRequest): Promise<GitCreatePRResponse> => {
      const res = await fetch(`${API_BASE}/api/git/create-pr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = (await res.json()) as GitCreatePRError
        // If PR already exists and we have the URL, include it in the error
        if (error.prAlreadyExists && error.existingPrUrl) {
          const err = new Error(error.error || 'PR already exists') as Error & { existingPrUrl?: string }
          err.existingPrUrl = error.existingPrUrl
          throw err
        }
        throw new Error(error.error || 'Failed to create PR')
      }

      return res.json()
    },
  })
}
