import { useQueryClient, useMutation } from '@tanstack/react-query'
import { useCallback, useMemo, useRef } from 'react'
import { useTask } from './use-tasks'
import type { Task, ViewState, DiffOptions, FilesViewState } from '@/types'

const getDefaultBrowserUrl = () => `http://${window.location.hostname}:3000`

const DEFAULT_VIEW_STATE: ViewState = {
  activeTab: 'diff',
  browserUrl: getDefaultBrowserUrl(),
  diffOptions: {
    wrap: false,
    ignoreWhitespace: false,
    includeUntracked: false,
  },
  filesViewState: {
    selectedFile: null,
    expandedDirs: [],
  },
}

export function useTaskViewState(taskId: string) {
  const queryClient = useQueryClient()
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const pendingUpdatesRef = useRef<Partial<ViewState>>({})

  const { data: task } = useTask(taskId)

  // Parse viewState from task, merge with defaults
  const viewState: ViewState = useMemo(() => {
    const stored = task?.viewState
    if (!stored) return DEFAULT_VIEW_STATE

    return {
      activeTab: stored.activeTab ?? DEFAULT_VIEW_STATE.activeTab,
      browserUrl: stored.browserUrl ?? DEFAULT_VIEW_STATE.browserUrl,
      diffOptions: {
        ...DEFAULT_VIEW_STATE.diffOptions,
        ...stored.diffOptions,
      },
      filesViewState: {
        ...DEFAULT_VIEW_STATE.filesViewState,
        ...stored.filesViewState,
      },
    }
  }, [task?.viewState])

  // Mutation for backend persistence
  const updateMutation = useMutation({
    mutationFn: async (newViewState: ViewState) => {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewState: newViewState }),
      })
      if (!response.ok) throw new Error('Failed to update view state')
      return response.json()
    },
    onSuccess: (data: Task) => {
      queryClient.setQueryData(['tasks', taskId], data)
      // Also update the tasks list cache if it exists
      queryClient.setQueryData<Task[]>(['tasks'], (old) => {
        if (!old) return old
        return old.map((t) => (t.id === taskId ? data : t))
      })
    },
  })

  // Optimistic update with debounced persistence
  const updateViewState = useCallback(
    (updates: Partial<ViewState>) => {
      // Merge with pending updates
      pendingUpdatesRef.current = {
        ...pendingUpdatesRef.current,
        ...updates,
        diffOptions:
          updates.diffOptions || pendingUpdatesRef.current.diffOptions
            ? {
                ...(pendingUpdatesRef.current.diffOptions ?? {}),
                ...(updates.diffOptions ?? {}),
              }
            : undefined,
        filesViewState:
          updates.filesViewState || pendingUpdatesRef.current.filesViewState
            ? {
                ...(pendingUpdatesRef.current.filesViewState ?? {}),
                ...(updates.filesViewState ?? {}),
              }
            : undefined,
      }

      // Build new view state
      const newViewState: ViewState = {
        ...viewState,
        ...pendingUpdatesRef.current,
        diffOptions: {
          ...viewState.diffOptions,
          ...(pendingUpdatesRef.current.diffOptions ?? {}),
        },
        filesViewState: {
          ...viewState.filesViewState,
          ...(pendingUpdatesRef.current.filesViewState ?? {}),
        },
      }

      // Immediate optimistic update
      queryClient.setQueryData<Task>(['tasks', taskId], (old) => {
        if (!old) return old
        return { ...old, viewState: newViewState }
      })

      // Also update the tasks list cache
      queryClient.setQueryData<Task[]>(['tasks'], (old) => {
        if (!old) return old
        return old.map((t) =>
          t.id === taskId ? { ...t, viewState: newViewState } : t
        )
      })

      // Debounced backend persistence
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        updateMutation.mutate(newViewState)
        pendingUpdatesRef.current = {}
      }, 500)
    },
    [queryClient, taskId, viewState, updateMutation]
  )

  const setActiveTab = useCallback(
    (tab: 'diff' | 'browser' | 'files') => {
      updateViewState({ activeTab: tab })
    },
    [updateViewState]
  )

  const setBrowserUrl = useCallback(
    (url: string) => {
      updateViewState({ browserUrl: url })
    },
    [updateViewState]
  )

  const setDiffOptions = useCallback(
    (options: Partial<DiffOptions>) => {
      updateViewState({ diffOptions: { ...viewState.diffOptions, ...options } })
    },
    [updateViewState, viewState.diffOptions]
  )

  const setFilesViewState = useCallback(
    (updates: Partial<FilesViewState>) => {
      updateViewState({ filesViewState: { ...viewState.filesViewState, ...updates } })
    },
    [updateViewState, viewState.filesViewState]
  )

  return {
    viewState,
    setActiveTab,
    setBrowserUrl,
    setDiffOptions,
    setFilesViewState,
  }
}
