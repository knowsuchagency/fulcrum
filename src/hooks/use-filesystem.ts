import { useQuery } from '@tanstack/react-query'

// Use relative URLs - works with both Vite dev proxy and production
const API_BASE = ''

interface DirectoryEntry {
  name: string
  type: 'file' | 'directory'
  isGitRepo: boolean
}

interface DirectoryListing {
  path: string
  parent: string
  entries: DirectoryEntry[]
}

interface BranchListing {
  branches: string[]
  current: string
}

interface GitFile {
  path: string
  status: string
  staged: boolean
}

interface GitDiff {
  branch: string
  diff: string
  files: GitFile[]
  hasStagedChanges: boolean
  hasUnstagedChanges: boolean
  isBranchDiff?: boolean
}

interface GitStatus {
  branch: string
  ahead: number
  behind: number
  files: GitFile[]
  clean: boolean
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }
  return res.json()
}

export function useDirectoryListing(path: string | null) {
  return useQuery({
    queryKey: ['fs', 'list', path],
    queryFn: () => {
      const params = path ? `?path=${encodeURIComponent(path)}` : ''
      return fetchJSON<DirectoryListing>(`${API_BASE}/api/fs/list${params}`)
    },
    enabled: path !== null,
  })
}

export function useBranches(repoPath: string | null) {
  return useQuery({
    queryKey: ['git', 'branches', repoPath],
    queryFn: () => {
      return fetchJSON<BranchListing>(
        `${API_BASE}/api/git/branches?repo=${encodeURIComponent(repoPath!)}`
      )
    },
    enabled: !!repoPath,
  })
}

export function useGitDiff(worktreePath: string | null, options: { staged?: boolean; ignoreWhitespace?: boolean; includeUntracked?: boolean } = {}) {
  const { staged = false, ignoreWhitespace = false, includeUntracked = false } = options
  return useQuery({
    queryKey: ['git', 'diff', worktreePath, staged, ignoreWhitespace, includeUntracked],
    queryFn: () => {
      const params = new URLSearchParams({
        path: worktreePath!,
        ...(staged && { staged: 'true' }),
        ...(ignoreWhitespace && { ignoreWhitespace: 'true' }),
        ...(includeUntracked && { includeUntracked: 'true' }),
      })
      return fetchJSON<GitDiff>(`${API_BASE}/api/git/diff?${params}`)
    },
    enabled: !!worktreePath,
    refetchInterval: 5000, // Refresh every 5 seconds
  })
}

export function useGitStatus(worktreePath: string | null) {
  return useQuery({
    queryKey: ['git', 'status', worktreePath],
    queryFn: () => {
      return fetchJSON<GitStatus>(
        `${API_BASE}/api/git/status?path=${encodeURIComponent(worktreePath!)}`
      )
    },
    enabled: !!worktreePath,
    refetchInterval: 5000, // Refresh every 5 seconds
  })
}
