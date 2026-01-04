import { useMemo } from 'react'
import type { Terminal as XTerm } from '@xterm/xterm'
import { useStore } from '../index'
import type { ITerminal, ITab } from '../models'
import { uploadImage } from '@/lib/upload'
import { log } from '@/lib/logger'

/**
 * Options for attaching an xterm.js instance
 */
interface AttachXtermOptions {
  /** Called when terminal is attached. Receives the actual terminal ID (may differ from tempId after optimistic update). */
  onAttached?: (terminalId: string) => void
}

/**
 * Options for destroying a terminal
 */
interface DestroyTerminalOptions {
  /** Required when destroying a terminal that belongs to a tab */
  force?: boolean
  /** Reason for deletion (for audit logging) */
  reason?: string
}

/**
 * Options for creating a terminal
 */
interface CreateTerminalOptions {
  name: string
  cols: number
  rows: number
  cwd?: string
  tabId?: string
  positionInTab?: number
  /** Startup info for task terminals - stored in volatile to survive component unmount */
  startup?: {
    startupScript?: string | null
    agent?: string
    agentOptions?: Record<string, string> | null
    aiMode?: 'default' | 'plan'
    description?: string
    taskName: string
    serverPort?: number
  }
}

/**
 * Startup info returned by consumePendingStartup
 */
export interface PendingStartupInfo {
  startupScript?: string | null
  agent?: string
  agentOptions?: Record<string, string> | null
  aiMode?: 'default' | 'plan'
  description?: string
  taskName: string
  serverPort?: number
}

/**
 * Hook return type matching useTerminalWS API for backward compatibility
 */
export interface UseTerminalStoreReturn {
  // State
  terminals: ITerminal[]
  terminalsLoaded: boolean
  tabs: ITab[]
  connected: boolean
  newTerminalIds: Set<string>
  /** Pending tab creation tempId - prevents redirect while waiting for server */
  pendingTabCreation: string | null
  /** Real ID of last created tab - triggers navigation in component */
  lastCreatedTabId: string | null

  // Terminal actions
  createTerminal: (options: CreateTerminalOptions) => void
  destroyTerminal: (terminalId: string, options?: DestroyTerminalOptions) => void
  writeToTerminal: (terminalId: string, data: string) => void
  sendInputToTerminal: (terminalId: string, text: string) => void
  resizeTerminal: (terminalId: string, cols: number, rows: number) => void
  renameTerminal: (terminalId: string, name: string) => void
  clearTerminalBuffer: (terminalId: string) => void
  assignTerminalToTab: (terminalId: string, tabId: string | null, positionInTab?: number) => void

  // Tab actions
  createTab: (name: string, position?: number, directory?: string) => void
  updateTab: (tabId: string, updates: { name?: string; directory?: string | null }) => void
  deleteTab: (tabId: string) => void
  reorderTab: (tabId: string, position: number) => void

  // Xterm attachment
  attachXterm: (terminalId: string, xterm: XTerm, options?: AttachXtermOptions) => () => void
  setupImagePaste: (container: HTMLElement, terminalId: string) => () => void

  // Startup management
  consumePendingStartup: (terminalId: string) => PendingStartupInfo | undefined
  clearStartingUp: (terminalId: string) => void

  // Tab creation navigation
  clearLastCreatedTabId: () => void
}

/**
 * Hook for terminal state management using MobX State Tree.
 *
 * This provides the same API as useTerminalWS but backed by MST store.
 * The store manages WebSocket connection, state sync, and xterm attachment.
 *
 * Usage:
 * ```tsx
 * const { terminals, tabs, connected, createTerminal, attachXterm } = useTerminalStore()
 * ```
 */
export function useTerminalStore(): UseTerminalStoreReturn {
  const store = useStore()

  // Memoize the return object to avoid unnecessary re-renders
  // The store actions are stable, and MST observable state triggers re-renders via mobx-react-lite
  return useMemo(() => {
    // Setup image paste handler (not part of store, but needed for backward compat)
    const setupImagePaste = (container: HTMLElement, terminalId: string) => {
      const handlePaste = async (e: ClipboardEvent) => {
        const items = e.clipboardData?.items
        if (!items) return

        // Check for image in clipboard
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            e.preventDefault()
            e.stopPropagation()

            const file = item.getAsFile()
            if (!file) return

            try {
              const path = await uploadImage(file)
              // Insert the path into the terminal
              store.writeToTerminal(terminalId, path)
            } catch (error) {
              log.ws.error('Failed to upload image', { error: String(error) })
            }
            return
          }
        }
        // If no image, let xterm handle the paste normally
      }

      container.addEventListener('paste', handlePaste, true)

      return () => {
        container.removeEventListener('paste', handlePaste, true)
      }
    }

    return {
      // State (these are observable via MST)
      get terminals() {
        return [...store.terminals.items]
      },
      get terminalsLoaded() {
        return store.initialized
      },
      get tabs() {
        return [...store.tabs.sorted]
      },
      get connected() {
        return store.connected
      },
      get newTerminalIds() {
        return store.newTerminalIds
      },
      get pendingTabCreation() {
        return store.pendingTabCreation
      },
      get lastCreatedTabId() {
        return store.lastCreatedTabId
      },

      // Terminal actions (delegated to store)
      createTerminal: store.createTerminal.bind(store),
      destroyTerminal: store.destroyTerminal.bind(store),
      writeToTerminal: store.writeToTerminal.bind(store),
      sendInputToTerminal: store.sendInputToTerminal.bind(store),
      resizeTerminal: store.resizeTerminal.bind(store),
      renameTerminal: store.renameTerminal.bind(store),
      clearTerminalBuffer: store.clearTerminalBuffer.bind(store),
      assignTerminalToTab: store.assignTerminalToTab.bind(store),

      // Tab actions (delegated to store)
      createTab: store.createTab.bind(store),
      updateTab: store.updateTab.bind(store),
      deleteTab: store.deleteTab.bind(store),
      reorderTab: store.reorderTab.bind(store),

      // Xterm attachment
      attachXterm: store.attachXterm.bind(store),
      setupImagePaste,

      // Startup management
      consumePendingStartup: store.consumePendingStartup.bind(store),
      clearStartingUp: store.clearStartingUp.bind(store),

      // Tab creation navigation
      clearLastCreatedTabId: store.clearLastCreatedTabId.bind(store),
    }
  }, [store])
}
