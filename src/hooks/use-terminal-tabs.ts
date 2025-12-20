import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'vibora:terminal-tabs'

export interface TerminalTab {
  id: string
  name: string
  terminalIds: string[]
}

interface TabsState {
  tabs: TerminalTab[]
  activeTabId: string
}

interface UseTerminalTabsReturn {
  tabs: TerminalTab[]
  activeTabId: string
  activeTab: TerminalTab | undefined
  createTab: (name?: string) => string
  renameTab: (tabId: string, name: string) => void
  deleteTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  addTerminalToTab: (terminalId: string, tabId?: string) => void
  removeTerminalFromTab: (terminalId: string) => void
  reconcileTerminals: (existingTerminalIds: string[]) => void
}

function generateId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function loadFromStorage(): TabsState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.tabs?.length > 0 && parsed.activeTabId) {
        return parsed
      }
    }
  } catch {
    // Ignore parse errors
  }

  // Default: single tab
  const defaultTab: TerminalTab = {
    id: generateId(),
    name: 'Main',
    terminalIds: [],
  }
  return {
    tabs: [defaultTab],
    activeTabId: defaultTab.id,
  }
}

function saveToStorage(state: TabsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage errors
  }
}

export function useTerminalTabs(): UseTerminalTabsReturn {
  const [state, setState] = useState<TabsState>(loadFromStorage)

  // Persist state changes to localStorage
  useEffect(() => {
    saveToStorage(state)
  }, [state])

  const createTab = useCallback((name?: string): string => {
    const newTab: TerminalTab = {
      id: generateId(),
      name: name || `Tab ${state.tabs.length + 1}`,
      terminalIds: [],
    }

    setState((prev) => ({
      tabs: [...prev.tabs, newTab],
      activeTabId: newTab.id,
    }))

    return newTab.id
  }, [state.tabs.length])

  const renameTab = useCallback((tabId: string, name: string): void => {
    setState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, name } : tab
      ),
    }))
  }, [])

  const deleteTab = useCallback((tabId: string): void => {
    setState((prev) => {
      // Don't delete the last tab
      if (prev.tabs.length <= 1) return prev

      const newTabs = prev.tabs.filter((tab) => tab.id !== tabId)
      let newActiveId = prev.activeTabId

      // If we deleted the active tab, switch to another
      if (prev.activeTabId === tabId) {
        const deletedIndex = prev.tabs.findIndex((t) => t.id === tabId)
        const newIndex = Math.min(deletedIndex, newTabs.length - 1)
        newActiveId = newTabs[newIndex].id
      }

      return {
        tabs: newTabs,
        activeTabId: newActiveId,
      }
    })
  }, [])

  const setActiveTab = useCallback((tabId: string): void => {
    setState((prev) => ({
      ...prev,
      activeTabId: tabId,
    }))
  }, [])

  const addTerminalToTab = useCallback((terminalId: string, tabId?: string): void => {
    setState((prev) => {
      const targetTabId = tabId || prev.activeTabId
      return {
        ...prev,
        tabs: prev.tabs.map((tab) =>
          tab.id === targetTabId && !tab.terminalIds.includes(terminalId)
            ? { ...tab, terminalIds: [...tab.terminalIds, terminalId] }
            : tab
        ),
      }
    })
  }, [])

  const removeTerminalFromTab = useCallback((terminalId: string): void => {
    setState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((tab) => ({
        ...tab,
        terminalIds: tab.terminalIds.filter((id) => id !== terminalId),
      })),
    }))
  }, [])

  // Reconcile tabs with actual terminals from server
  // - Remove terminalIds that no longer exist
  // - Orphan terminals go to first tab
  const reconcileTerminals = useCallback((existingTerminalIds: string[]): void => {
    setState((prev) => {
      const existingSet = new Set(existingTerminalIds)
      const assignedSet = new Set(prev.tabs.flatMap((t) => t.terminalIds))

      // Find orphans (exist on server but not in any tab)
      const orphans = existingTerminalIds.filter((id) => !assignedSet.has(id))

      // Clean up stale IDs and add orphans to first tab
      const newTabs = prev.tabs.map((tab, index) => ({
        ...tab,
        terminalIds: [
          ...tab.terminalIds.filter((id) => existingSet.has(id)),
          ...(index === 0 ? orphans : []),
        ],
      }))

      return {
        ...prev,
        tabs: newTabs,
      }
    })
  }, [])

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)

  return {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeTab,
    createTab,
    renameTab,
    deleteTab,
    setActiveTab,
    addTerminalToTab,
    removeTerminalFromTab,
    reconcileTerminals,
  }
}
