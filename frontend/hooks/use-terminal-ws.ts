/**
 * Terminal WebSocket hook - LEGACY WRAPPER
 *
 * This hook provides backward compatibility for code using the old useTerminalWS API.
 * It wraps the new MobX State Tree (MST) store internally.
 *
 * For new code, prefer using `useTerminalStore` from '@/stores' directly.
 */
import type { Terminal as XTerm } from '@xterm/xterm'
import { useTerminalStore } from '@/stores'
import type { ITerminal, ITab } from '@/stores'

// Types matching server/types.ts - exported for backward compatibility
export type TerminalStatus = 'running' | 'exited' | 'error'

export interface TabInfo {
  id: string
  name: string
  position: number
  directory?: string
  createdAt: number
}

export interface TerminalInfo {
  id: string
  name: string
  cwd: string
  status: TerminalStatus
  exitCode?: number
  cols: number
  rows: number
  createdAt: number
  tabId?: string
  positionInTab?: number
}

interface UseTerminalWSOptions {
  /** @deprecated Options are now configured via StoreProvider */
  url?: string
  /** @deprecated Options are now configured via StoreProvider */
  reconnectInterval?: number
  /** @deprecated Options are now configured via StoreProvider */
  maxReconnectAttempts?: number
}

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

interface PendingStartupInfo {
  startupScript?: string | null
  agent?: string
  agentOptions?: Record<string, string> | null
  aiMode?: 'default' | 'plan'
  description?: string
  taskName: string
  serverPort?: number
}

interface AttachXtermOptions {
  /** Called when terminal is attached. Receives the actual terminal ID (may differ from tempId after optimistic update). */
  onAttached?: (terminalId: string) => void
}

interface DestroyTerminalOptions {
  /** Required when destroying a terminal that belongs to a tab */
  force?: boolean
  /** Reason for deletion (for audit logging) */
  reason?: string
}

interface UseTerminalWSReturn {
  terminals: TerminalInfo[]
  terminalsLoaded: boolean
  tabs: TabInfo[]
  connected: boolean
  newTerminalIds: Set<string>
  createTerminal: (options: CreateTerminalOptions) => void
  destroyTerminal: (terminalId: string, options?: DestroyTerminalOptions) => void
  writeToTerminal: (terminalId: string, data: string) => void
  sendInputToTerminal: (terminalId: string, text: string) => void
  resizeTerminal: (terminalId: string, cols: number, rows: number) => void
  renameTerminal: (terminalId: string, name: string) => void
  clearTerminalBuffer: (terminalId: string) => void
  assignTerminalToTab: (terminalId: string, tabId: string | null, positionInTab?: number) => void
  createTab: (name: string, position?: number, directory?: string) => void
  updateTab: (tabId: string, updates: { name?: string; directory?: string | null }) => void
  deleteTab: (tabId: string) => void
  reorderTab: (tabId: string, position: number) => void
  attachXterm: (terminalId: string, xterm: XTerm, options?: AttachXtermOptions) => () => void
  setupImagePaste: (container: HTMLElement, terminalId: string) => () => void
  consumePendingStartup: (terminalId: string) => PendingStartupInfo | undefined
  clearStartingUp: (terminalId: string) => void
}

/**
 * Convert MST terminal to TerminalInfo for backward compatibility
 */
function toTerminalInfo(terminal: ITerminal): TerminalInfo {
  return {
    id: terminal.id,
    name: terminal.name,
    cwd: terminal.cwd,
    status: terminal.status,
    exitCode: terminal.exitCode,
    cols: terminal.cols,
    rows: terminal.rows,
    createdAt: terminal.createdAt,
    tabId: terminal.tabId ?? undefined,
    positionInTab: terminal.positionInTab,
  }
}

/**
 * Convert MST tab to TabInfo for backward compatibility
 */
function toTabInfo(tab: ITab): TabInfo {
  return {
    id: tab.id,
    name: tab.name,
    position: tab.position,
    directory: tab.directory ?? undefined,
    createdAt: tab.createdAt,
  }
}

/**
 * @deprecated Use `useTerminalStore` from '@/stores' instead.
 *
 * This hook wraps the MST store for backward compatibility.
 * The `options` parameter is ignored - WebSocket configuration is now
 * handled by StoreProvider in main.tsx.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useTerminalWS(_options: UseTerminalWSOptions = {}): UseTerminalWSReturn {
  const store = useTerminalStore()

  return {
    // Convert MST types to legacy types for backward compat
    get terminals() {
      return store.terminals.map(toTerminalInfo)
    },
    get terminalsLoaded() {
      return store.terminalsLoaded
    },
    get tabs() {
      return store.tabs.map(toTabInfo)
    },
    get connected() {
      return store.connected
    },
    get newTerminalIds() {
      return store.newTerminalIds
    },

    // Actions pass through directly
    createTerminal: store.createTerminal,
    destroyTerminal: store.destroyTerminal,
    writeToTerminal: store.writeToTerminal,
    sendInputToTerminal: store.sendInputToTerminal,
    resizeTerminal: store.resizeTerminal,
    renameTerminal: store.renameTerminal,
    clearTerminalBuffer: store.clearTerminalBuffer,
    assignTerminalToTab: store.assignTerminalToTab,
    createTab: store.createTab,
    updateTab: store.updateTab,
    deleteTab: store.deleteTab,
    reorderTab: store.reorderTab,
    attachXterm: store.attachXterm,
    setupImagePaste: store.setupImagePaste,
    consumePendingStartup: store.consumePendingStartup,
    clearStartingUp: store.clearStartingUp,
  }
}
