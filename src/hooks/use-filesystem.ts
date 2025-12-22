import { useQuery } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'
import type { FileTreeEntry, FileContent } from '@/types'

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

interface FileTreeResponse {
  root: string
  entries: FileTreeEntry[]
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

export function useFileTree(worktreePath: string | null) {
  return useQuery({
    queryKey: ['fs', 'tree', worktreePath],
    queryFn: () => {
      return fetchJSON<FileTreeResponse>(
        `${API_BASE}/api/fs/tree?root=${encodeURIComponent(worktreePath!)}`
      )
    },
    enabled: !!worktreePath,
    staleTime: 10000, // Cache for 10 seconds
  })
}

export function useFileContent(
  worktreePath: string | null,
  filePath: string | null,
  options?: { maxLines?: number }
) {
  return useQuery({
    queryKey: ['fs', 'read', worktreePath, filePath, options?.maxLines],
    queryFn: () => {
      const params = new URLSearchParams({
        path: filePath!,
        root: worktreePath!,
        ...(options?.maxLines && { maxLines: options.maxLines.toString() }),
      })
      return fetchJSON<FileContent>(`${API_BASE}/api/fs/read?${params}`)
    },
    enabled: !!worktreePath && !!filePath,
  })
}

interface IsGitRepoResponse {
  path: string
  isGitRepo: boolean
}

export async function checkIsGitRepo(path: string): Promise<IsGitRepoResponse> {
  return fetchJSON<IsGitRepoResponse>(
    `${API_BASE}/api/fs/is-git-repo?path=${encodeURIComponent(path)}`
  )
}
