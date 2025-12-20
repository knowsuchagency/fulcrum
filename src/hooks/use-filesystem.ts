import { useQuery } from '@tanstack/react-query'

const API_BASE = `http://${window.location.hostname}:3001`

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

export function useGitDiff(worktreePath: string | null, staged = false) {
  return useQuery({
    queryKey: ['git', 'diff', worktreePath, staged],
    queryFn: () => {
      const params = new URLSearchParams({
        path: worktreePath!,
        ...(staged && { staged: 'true' }),
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
