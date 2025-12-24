import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useCallback, useRef, useEffect } from 'react'

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
  activeTabId: null,
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

      // Build new view state
      const merged = pendingUpdatesRef.current
      const newViewState: TerminalViewState = {
        activeTabId: merged.activeTabId !== undefined ? merged.activeTabId : viewState.activeTabId,
        focusedTerminals: {
          ...viewState.focusedTerminals,
          ...merged.focusedTerminals,
        },
        currentView: merged.currentView !== undefined ? merged.currentView : viewState.currentView,
        currentTaskId: merged.currentTaskId !== undefined ? merged.currentTaskId : viewState.currentTaskId,
        isTabVisible: merged.isTabVisible !== undefined ? merged.isTabVisible : viewState.isTabVisible,
        viewUpdatedAt: merged.viewUpdatedAt !== undefined ? merged.viewUpdatedAt : viewState.viewUpdatedAt,
      }

      // Immediate optimistic update
      queryClient.setQueryData(['terminal-view-state'], newViewState)

      // Debounced backend persistence
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        updateMutation.mutate(pendingUpdatesRef.current)
        pendingUpdatesRef.current = {}
      }, 500)
    },
    [queryClient, viewState, updateMutation]
  )

  const setActiveTab = useCallback(
    (tabId: string | null) => {
      updateViewState({ activeTabId: tabId })
    },
    [updateViewState]
  )

  const setFocusedTerminal = useCallback(
    (tabId: string, terminalId: string | null) => {
      if (terminalId === null) {
        // Remove the entry for this tab
        const { [tabId]: _unused, ...rest } = viewState.focusedTerminals
        void _unused
        updateViewState({ focusedTerminals: rest })
      } else {
        updateViewState({ focusedTerminals: { [tabId]: terminalId } })
      }
    },
    [updateViewState, viewState.focusedTerminals]
  )

  const getFocusedTerminal = useCallback(
    (tabId: string): string | null => {
      return viewState.focusedTerminals[tabId] ?? null
    },
    [viewState.focusedTerminals]
  )

  // Track document visibility for notification suppression
  useEffect(() => {
    const handleVisibilityChange = () => {
      updateViewState({
        isTabVisible: document.visibilityState === 'visible',
        viewUpdatedAt: new Date().toISOString(),
      })
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    // Send initial state
    handleVisibilityChange()
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [updateViewState])

  // Update view tracking (for route changes)
  const updateViewTracking = useCallback(
    (currentView: string, currentTaskId: string | null) => {
      updateViewState({
        currentView,
        currentTaskId,
        viewUpdatedAt: new Date().toISOString(),
      })
    },
    [updateViewState]
  )

  return {
    viewState,
    isLoading,
    activeTabId: viewState.activeTabId,
    setActiveTab,
    getFocusedTerminal,
    setFocusedTerminal,
    updateViewTracking,
  }
}
