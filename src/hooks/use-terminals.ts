import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Terminal, TerminalTab, TerminalLayout } from '@/types'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// In-memory stores
let tabsStore: TerminalTab[] = []
let terminalsStore: Terminal[] = []

// Terminal Tabs hooks
export function useTerminalTabs() {
  return useQuery({
    queryKey: ['terminal-tabs'],
    queryFn: async () => {
      await delay(150)
      return tabsStore.sort((a, b) => a.position - b.position)
    },
  })
}

export function useCreateTerminalTab() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { name: string; layout?: TerminalLayout }) => {
      await delay(200)
      const newTab: TerminalTab = {
        id: `tab-${Date.now()}`,
        name: data.name,
        layout: data.layout ?? 'single',
        position: tabsStore.length,
      }
      tabsStore = [...tabsStore, newTab]
      return newTab
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terminal-tabs'] })
    },
  })
}

export function useUpdateTerminalTab() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      tabId,
      updates,
    }: {
      tabId: string
      updates: Partial<Pick<TerminalTab, 'name' | 'layout'>>
    }) => {
      await delay(100)
      tabsStore = tabsStore.map((tab) =>
        tab.id === tabId ? { ...tab, ...updates } : tab
      )
      return tabsStore.find((t) => t.id === tabId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terminal-tabs'] })
    },
  })
}

export function useDeleteTerminalTab() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (tabId: string) => {
      await delay(150)
      // Also delete terminals in this tab
      terminalsStore = terminalsStore.filter((t) => t.tabId !== tabId)
      tabsStore = tabsStore.filter((t) => t.id !== tabId)
      return tabId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terminal-tabs'] })
      queryClient.invalidateQueries({ queryKey: ['terminals'] })
    },
  })
}

// Terminals hooks
export function useTerminals(tabId?: string) {
  return useQuery({
    queryKey: ['terminals', tabId],
    queryFn: async () => {
      await delay(100)
      const filtered = tabId
        ? terminalsStore.filter((t) => t.tabId === tabId)
        : terminalsStore
      return filtered.sort((a, b) => a.position - b.position)
    },
  })
}

export function useCreateTerminal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      tabId?: string
      taskId?: string
      name: string
      cwd?: string
    }) => {
      await delay(200)
      const existingInTab = terminalsStore.filter((t) => t.tabId === data.tabId)
      const newTerminal: Terminal = {
        id: `term-${Date.now()}`,
        tabId: data.tabId ?? null,
        taskId: data.taskId ?? null,
        name: data.name,
        position: existingInTab.length,
        cwd: data.cwd,
      }
      terminalsStore = [...terminalsStore, newTerminal]
      return newTerminal
    },
    onSuccess: (_, { tabId }) => {
      queryClient.invalidateQueries({ queryKey: ['terminals', tabId] })
    },
  })
}

export function useDeleteTerminal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (terminalId: string) => {
      await delay(100)
      const terminal = terminalsStore.find((t) => t.id === terminalId)
      terminalsStore = terminalsStore.filter((t) => t.id !== terminalId)
      return terminal
    },
    onSuccess: (terminal) => {
      if (terminal?.tabId) {
        queryClient.invalidateQueries({ queryKey: ['terminals', terminal.tabId] })
      }
      queryClient.invalidateQueries({ queryKey: ['terminals'] })
    },
  })
}
