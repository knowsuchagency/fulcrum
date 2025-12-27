import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useCallback, useRef, useEffect } from 'react'

// Module-level flag to ensure visibility tracking only runs once globally
let visibilityInitialized = false

interface FocusedTerminalsMap {
  [tabId: string]: string
}

interface TerminalViewState {
  activeTabId: string | null
  focusedTerminals: FocusedTerminalsMap
  // View tracking for notification suppression
  currentView: string | null
  currentTaskId: string | null
  isTabVisible: boolean | null
  viewUpdatedAt: string | null
}

interface PendingUpdates {
  activeTabId?: string | null
  focusedTerminals?: FocusedTerminalsMap
  currentView?: string | null
  currentTaskId?: string | null
  isTabVisible?: boolean | null
  viewUpdatedAt?: string | null
}

const DEFAULT_VIEW_STATE: TerminalViewState = {
  activeTabId: null, // Deprecated: tab state is now stored in URL
  focusedTerminals: {},
  currentView: null,
  currentTaskId: null,
  isTabVisible: null,
  viewUpdatedAt: null,
}

export function useTerminalViewState() {
  const queryClient = useQueryClient()
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingUpdatesRef = useRef<PendingUpdates>({})

  // Fetch initial state
  const { data: viewState = DEFAULT_VIEW_STATE, isLoading } = useQuery({
    queryKey: ['terminal-view-state'],
    queryFn: async (): Promise<TerminalViewState> => {
      const response = await fetch('/api/terminal-view-state')
      if (!response.ok) throw new Error('Failed to fetch terminal view state')
      return response.json()
    },
    // Prevent refetch from racing with optimistic updates during navigation.
    // The 500ms debounced mutation needs time to persist before a refetch could
    // potentially return stale server data and overwrite the optimistic state.
    staleTime: 2000,
  })

  // Mutation for backend persistence
  const updateMutation = useMutation({
    mutationFn: async (updates: PendingUpdates) => {
      const response = await fetch('/api/terminal-view-state', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!response.ok) throw new Error('Failed to update terminal view state')
      return response.json()
    },
    onSuccess: (data: TerminalViewState) => {
      queryClient.setQueryData(['terminal-view-state'], data)
    },
  })

  // Stable ref for mutation to avoid recreating updateViewState
  const updateMutationRef = useRef(updateMutation)
  updateMutationRef.current = updateMutation

  // Optimistic update with debounced persistence
  const updateViewState = useCallback(
    (updates: PendingUpdates) => {
      // Merge with pending updates
      const pending = pendingUpdatesRef.current
      pendingUpdatesRef.current = {
        ...pending,
        ...updates,
        focusedTerminals:
          updates.focusedTerminals || pending.focusedTerminals
            ? { ...pending.focusedTerminals, ...updates.focusedTerminals }
            : undefined,
      }

      // Use setQueryData with callback to access current state without depending on viewState
      const merged = pendingUpdatesRef.current
      queryClient.setQueryData(['terminal-view-state'], (current: TerminalViewState | undefined) => {
        const currentState = current ?? DEFAULT_VIEW_STATE
        return {
          activeTabId: merged.activeTabId !== undefined ? merged.activeTabId : currentState.activeTabId,
          focusedTerminals: {
            ...currentState.focusedTerminals,
            ...merged.focusedTerminals,
          },
          currentView: merged.currentView !== undefined ? merged.currentView : currentState.currentView,
          currentTaskId: merged.currentTaskId !== undefined ? merged.currentTaskId : currentState.currentTaskId,
          isTabVisible: merged.isTabVisible !== undefined ? merged.isTabVisible : currentState.isTabVisible,
          viewUpdatedAt: merged.viewUpdatedAt !== undefined ? merged.viewUpdatedAt : currentState.viewUpdatedAt,
        }
      })

      // Debounced backend persistence
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        updateMutationRef.current.mutate(pendingUpdatesRef.current)
        pendingUpdatesRef.current = {}
      }, 500)
    },
    [queryClient]
  )

  const setFocusedTerminal = useCallback(
    (tabId: string, terminalId: string | null) => {
      if (terminalId === null) {
        // Remove the entry for this tab - use queryClient to get current state
        const current = queryClient.getQueryData<TerminalViewState>(['terminal-view-state'])
        if (current) {
          const { [tabId]: _unused, ...rest } = current.focusedTerminals
          void _unused
          updateViewState({ focusedTerminals: rest })
        }
      } else {
        updateViewState({ focusedTerminals: { [tabId]: terminalId } })
      }
    },
    [queryClient, updateViewState]
  )

  const getFocusedTerminal = useCallback(
    (tabId: string): string | null => {
      return viewState.focusedTerminals[tabId] ?? null
    },
    [viewState.focusedTerminals]
  )

  // Track document visibility for notification suppression
  // Use a module-level flag to ensure this only runs once globally
  const hasInitializedVisibilityRef = useRef(false)
  useEffect(() => {
    // Skip if already initialized by another hook instance
    if (visibilityInitialized) {
      hasInitializedVisibilityRef.current = false
      return
    }
    visibilityInitialized = true
    hasInitializedVisibilityRef.current = true

    const handleVisibilityChange = () => {
      updateViewState({
        isTabVisible: document.visibilityState === 'visible',
        viewUpdatedAt: new Date().toISOString(),
      })
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    // Send initial state
    handleVisibilityChange()
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      // Only reset flag if this instance initialized it
      if (hasInitializedVisibilityRef.current) {
        visibilityInitialized = false
      }
    }
  }, [updateViewState])

  // Update view tracking (for route changes)
  const updateViewTracking = useCallback(
    (currentView: string, currentTaskId: string | null, activeTabId?: string | null) => {
      updateViewState({
        currentView,
        currentTaskId,
        activeTabId,
        viewUpdatedAt: new Date().toISOString(),
      })
    },
    [updateViewState]
  )

  return {
    viewState,
    isLoading,
    getFocusedTerminal,
    setFocusedTerminal,
    updateViewTracking,
  }
}
