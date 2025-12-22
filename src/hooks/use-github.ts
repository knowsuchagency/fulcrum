import { useQuery } from '@tanstack/react-query'

const API_BASE = ''

export interface GitHubIssue {
  id: number
  number: number
  title: string
  htmlUrl: string
  createdAt: string
  updatedAt: string
  repository: { owner: string; repo: string; fullName: string }
  labels: { name: string; color: string }[]
}

export interface GitHubPR {
  id: number
  number: number
  title: string
  htmlUrl: string
  createdAt: string
  updatedAt: string
  draft: boolean
  repository: { owner: string; repo: string; fullName: string }
  author: { login: string; avatarUrl: string }
  labels: { name: string; color: string }[]
}

export interface GitHubUser {
  login: string
  avatarUrl: string
}

export function useGitHubUser() {
  return useQuery({
    queryKey: ['github-user'],
    queryFn: async (): Promise<GitHubUser | null> => {
      const res = await fetch(`${API_BASE}/api/github/user`)
      if (!res.ok) return null
      return res.json()
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: false,
  })
}

export function useGitHubIssues(viboraReposOnly: boolean) {
  return useQuery({
    queryKey: ['github-issues', viboraReposOnly],
    queryFn: async (): Promise<GitHubIssue[]> => {
      const params = new URLSearchParams()
      if (viboraReposOnly) params.set('viboraReposOnly', 'true')
      const res = await fetch(`${API_BASE}/api/github/issues?${params}`)
      if (!res.ok) throw new Error('Failed to fetch issues')
      return res.json()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes for rate limiting
  })
}

export type PRFilter = 'all' | 'created' | 'assigned'

export function useGitHubPRs(filter: PRFilter, viboraReposOnly: boolean) {
  return useQuery({
    queryKey: ['github-prs', filter, viboraReposOnly],
    queryFn: async (): Promise<GitHubPR[]> => {
      const params = new URLSearchParams({ filter })
      if (viboraReposOnly) params.set('viboraReposOnly', 'true')
      const res = await fetch(`${API_BASE}/api/github/prs?${params}`)
      if (!res.ok) throw new Error('Failed to fetch PRs')
      return res.json()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes for rate limiting
  })
}
