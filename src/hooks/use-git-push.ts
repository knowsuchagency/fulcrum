import { useMutation } from '@tanstack/react-query'

const API_BASE = ''

interface GitPushRequest {
  worktreePath: string
}

interface GitPushResponse {
  success: boolean
  branch: string
}

interface GitPushError {
  error: string
  hasUncommittedChanges?: boolean
  pushRejected?: boolean
}

export function useGitPush() {
  return useMutation({
    mutationFn: async (data: GitPushRequest): Promise<GitPushResponse> => {
      const res = await fetch(`${API_BASE}/api/git/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = (await res.json()) as GitPushError
        throw new Error(error.error || 'Push failed')
      }

      return res.json()
    },
  })
}
