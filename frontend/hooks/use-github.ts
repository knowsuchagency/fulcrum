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

export interface GitHubOrg {
  login: string
  avatarUrl: string
}

export type PRFilter = 'all' | 'created' | 'assigned' | 'review_requested' | 'mentioned'
export type IssueFilter = 'assigned' | 'created' | 'mentioned'

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

export function useGitHubOrgs() {
  return useQuery({
    queryKey: ['github-orgs'],
    queryFn: async (): Promise<GitHubOrg[]> => {
      const res = await fetch(`${API_BASE}/api/github/orgs`)
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  })
}

export function useGitHubIssues(
  filter: IssueFilter,
  fulcrumReposOnly: boolean,
  org?: string
) {
  return useQuery({
    queryKey: ['github-issues', filter, fulcrumReposOnly, org],
    queryFn: async (): Promise<GitHubIssue[]> => {
      const params = new URLSearchParams({ filter })
      if (fulcrumReposOnly) params.set('fulcrumReposOnly', 'true')
      if (org) params.set('org', org)
      const res = await fetch(`${API_BASE}/api/github/issues?${params}`)
      if (!res.ok) throw new Error('Failed to fetch issues')
      return res.json()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes for rate limiting
  })
}

export function useGitHubPRs(
  filter: PRFilter,
  fulcrumReposOnly: boolean,
  org?: string
) {
  return useQuery({
    queryKey: ['github-prs', filter, fulcrumReposOnly, org],
    queryFn: async (): Promise<GitHubPR[]> => {
      const params = new URLSearchParams({ filter })
      if (fulcrumReposOnly) params.set('fulcrumReposOnly', 'true')
      if (org) params.set('org', org)
      const res = await fetch(`${API_BASE}/api/github/prs?${params}`)
      if (!res.ok) throw new Error('Failed to fetch PRs')
      return res.json()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes for rate limiting
  })
}
