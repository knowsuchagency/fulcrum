import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'
import type { Worktree, WorktreeBasic, WorktreeDetails, WorktreesSummary } from '@/types'

const API_BASE = ''

interface UseWorktreesReturn {
  worktrees: Worktree[]
  summary: WorktreesSummary | null
  isLoading: boolean
  isLoadingDetails: boolean
  error: Error | null
  refetch: () => void
}

export function useWorktrees(): UseWorktreesReturn {
  const [worktreesMap, setWorktreesMap] = useState<Map<string, Worktree>>(new Map())
  const [summary, setSummary] = useState<WorktreesSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const pendingDetailsRef = useRef<number>(0)

  const connect = useCallback(() => {
    // Close existing connection
    eventSourceRef.current?.close()

    setIsLoading(true)
    setIsLoadingDetails(false)
    setError(null)
    setWorktreesMap(new Map())
    setSummary(null)

    const eventSource = new EventSource(`${API_BASE}/api/worktrees`)
    eventSourceRef.current = eventSource

    eventSource.addEventListener('worktree:basic', (e) => {
      const basics: WorktreeBasic[] = JSON.parse(e.data)
      pendingDetailsRef.current = basics.length

      setWorktreesMap(
        new Map(
          basics.map((b) => [
            b.path,
            {
              ...b,
              size: 0,
              sizeFormatted: '...',
              branch: '...',
            },
          ])
        )
      )
      setIsLoading(false)
      setIsLoadingDetails(basics.length > 0)
    })

    eventSource.addEventListener('worktree:details', (e) => {
      const details: WorktreeDetails = JSON.parse(e.data)

      setWorktreesMap((prev) => {
        const next = new Map(prev)
        const existing = next.get(details.path)
        if (existing) {
          next.set(details.path, {
            ...existing,
            size: details.size,
            sizeFormatted: details.sizeFormatted,
            branch: details.branch,
          })
        }
        return next
      })

      pendingDetailsRef.current--
      if (pendingDetailsRef.current <= 0) {
        setIsLoadingDetails(false)
      }
    })

    eventSource.addEventListener('worktree:complete', (e) => {
      const summaryData: WorktreesSummary = JSON.parse(e.data)
      setSummary(summaryData)
      setIsLoadingDetails(false)
      eventSource.close()
    })

    eventSource.addEventListener('worktree:error', (e) => {
      const { path: errorPath } = JSON.parse(e.data)
      console.error(`Error loading worktree details for ${errorPath}`)
      pendingDetailsRef.current--
      if (pendingDetailsRef.current <= 0) {
        setIsLoadingDetails(false)
      }
    })

    eventSource.onerror = () => {
      setError(new Error('Connection lost'))
      setIsLoading(false)
      setIsLoadingDetails(false)
      eventSource.close()
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      eventSourceRef.current?.close()
    }
  }, [connect])

  // Convert Map to sorted array (maintain sort order from server)
  const sortedWorktrees = useMemo(() => {
    const arr = Array.from(worktreesMap.values())
    // Sort: orphaned first, then by lastModified (newest first)
    return arr.sort((a, b) => {
      if (a.isOrphaned !== b.isOrphaned) return a.isOrphaned ? -1 : 1
      return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    })
  }, [worktreesMap])

  return {
    worktrees: sortedWorktrees,
    summary,
    isLoading,
    isLoadingDetails,
    error,
    refetch: connect,
  }
}

export function useDeleteWorktree() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ worktreePath, repoPath }: { worktreePath: string; repoPath?: string }) =>
      fetchJSON<{ success: boolean; path: string }>(`${API_BASE}/api/worktrees`, {
        method: 'DELETE',
        body: JSON.stringify({ worktreePath, repoPath }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worktrees'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
