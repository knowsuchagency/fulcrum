import { useCallback, useEffect, useRef, useState } from 'react'
import type { Terminal as XTerm } from '@xterm/xterm'
import { uploadImage } from '@/lib/upload'

// Send debug logs to server (visible in ~/.vibora/desktop.log)
// Enable with VITE_VIBORA_DEBUG=1 in .env or environment
const DEBUG_ENABLED = import.meta.env.VITE_VIBORA_DEBUG === '1'

function debugLog(message: string, data?: unknown) {
  if (!DEBUG_ENABLED) return
  console.log(message, data)
  fetch('/api/debug', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, data }),
  }).catch(() => {}) // Ignore errors
}

// Types matching server/types.ts
export type TerminalStatus = 'running' | 'exited' | 'error'

export interface TabInfo {
  id: string
  name: string
  position: number
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

type ServerMessage =
  | { type: 'terminal:created'; payload: { terminal: TerminalInfo; isNew: boolean } }
  | { type: 'terminal:output'; payload: { terminalId: string; data: string } }
  | { type: 'terminal:exit'; payload: { terminalId: string; exitCode: number } }
  | { type: 'terminal:attached'; payload: { terminalId: string; buffer: string } }
  | { type: 'terminal:bufferCleared'; payload: { terminalId: string } }
  | { type: 'terminals:list'; payload: { terminals: TerminalInfo[] } }
  | { type: 'terminal:error'; payload: { terminalId?: string; error: string } }
  | { type: 'terminal:renamed'; payload: { terminalId: string; name: string } }
  | { type: 'terminal:destroyed'; payload: { terminalId: string } }
  | { type: 'terminal:tabAssigned'; payload: { terminalId: string; tabId: string | null; positionInTab: number } }
  | { type: 'tab:created'; payload: { tab: TabInfo } }
  | { type: 'tab:renamed'; payload: { tabId: string; name: string } }
  | { type: 'tab:deleted'; payload: { tabId: string } }
  | { type: 'tab:reordered'; payload: { tabId: string; position: number } }
  | { type: 'tabs:list'; payload: { tabs: TabInfo[] } }

interface UseTerminalWSOptions {
  url?: string
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

interface CreateTerminalOptions {
  name: string
  cols: number
  rows: number
  cwd?: string
  tabId?: string
  positionInTab?: number
}

interface AttachXtermOptions {
  onAttached?: () => void
}

interface UseTerminalWSReturn {
  terminals: TerminalInfo[]
  terminalsLoaded: boolean
  tabs: TabInfo[]
  connected: boolean
  newTerminalIds: Set<string>
  createTerminal: (options: CreateTerminalOptions) => void
  destroyTerminal: (terminalId: string) => void
  writeToTerminal: (terminalId: string, data: string) => void
  sendInputToTerminal: (terminalId: string, text: string) => void
  resizeTerminal: (terminalId: string, cols: number, rows: number) => void
  renameTerminal: (terminalId: string, name: string) => void
  clearTerminalBuffer: (terminalId: string) => void
  assignTerminalToTab: (terminalId: string, tabId: string | null, positionInTab?: number) => void
  createTab: (name: string, position?: number) => void
  renameTab: (tabId: string, name: string) => void
  deleteTab: (tabId: string) => void
  reorderTab: (tabId: string, position: number) => void
  attachXterm: (terminalId: string, xterm: XTerm, options?: AttachXtermOptions) => () => void
  setupImagePaste: (container: HTMLElement, terminalId: string) => () => void
}

// Construct WebSocket URL based on current location
// In dev: Vite proxies /ws to the backend
// In production: Same origin
function getDefaultWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/terminal`
}

export function useTerminalWS(options: UseTerminalWSOptions = {}): UseTerminalWSReturn {
  const {
    url = getDefaultWsUrl(),
    reconnectInterval = 2000,
    maxReconnectAttempts = 10,
  } = options

  const [terminals, setTerminals] = useState<TerminalInfo[]>([])
  const [terminalsLoaded, setTerminalsLoaded] = useState(false)
  const [tabs, setTabs] = useState<TabInfo[]>([])
  const [connected, setConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const xtermMapRef = useRef<Map<string, XTerm>>(new Map())
  const newTerminalIdsRef = useRef<Set<string>>(new Set())
  const onAttachedCallbacksRef = useRef<Map<string, () => void>>(new Map())
  const connectRef = useRef<() => void>(() => {})
  const lastFocusedTerminalRef = useRef<string | null>(null)
  const wasConnectedRef = useRef(false)

  const send = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: ServerMessage = JSON.parse(event.data)

      switch (message.type) {
        // Terminal messages
        case 'terminals:list':
          setTerminals(message.payload.terminals)
          setTerminalsLoaded(true)
          break

        case 'terminal:created':
          debugLog('[useTerminalWS] terminal:created received', {
            id: message.payload.terminal.id,
            isNew: message.payload.isNew,
            cwd: message.payload.terminal.cwd,
          })
          // Deduplicate: only add if not already present (prevents duplicates from multiple WS clients)
          setTerminals((prev) => {
            if (prev.some((t) => t.id === message.payload.terminal.id)) {
              debugLog('[useTerminalWS] terminal:created SKIPPED (already exists)', {
                id: message.payload.terminal.id,
              })
              return prev
            }
            return [...prev, message.payload.terminal]
          })
          if (message.payload.isNew) {
            newTerminalIdsRef.current.add(message.payload.terminal.id)
            debugLog('[useTerminalWS] added to newTerminalIds', {
              id: message.payload.terminal.id,
              newSize: newTerminalIdsRef.current.size,
              contents: Array.from(newTerminalIdsRef.current),
            })
          }
          break

        case 'terminal:output': {
          const xterm = xtermMapRef.current.get(message.payload.terminalId)
          debugLog('[useTerminalWS] terminal:output received', {
            terminalId: message.payload.terminalId,
            hasXterm: !!xterm,
            dataLen: message.payload.data.length,
          })
          if (xterm) {
            xterm.write(message.payload.data)
          }
          break
        }

        case 'terminal:attached': {
          debugLog('[useTerminalWS] terminal:attached received', {
            terminalId: message.payload.terminalId,
            hasXterm: xtermMapRef.current.has(message.payload.terminalId),
            hasCallback: onAttachedCallbacksRef.current.has(message.payload.terminalId),
            callbackKeys: Array.from(onAttachedCallbacksRef.current.keys()),
          })
          const xterm = xtermMapRef.current.get(message.payload.terminalId)
          if (xterm) {
            // Reset terminal to clean state before replaying buffer
            // This prevents corrupted escape sequences from persisting
            xterm.reset()
            if (message.payload.buffer) {
              xterm.write(message.payload.buffer)
            }
          }
          // Call onAttached callback if registered
          const callback = onAttachedCallbacksRef.current.get(message.payload.terminalId)
          if (callback) {
            debugLog('[useTerminalWS] calling onAttached callback')
            onAttachedCallbacksRef.current.delete(message.payload.terminalId)
            callback()
          } else {
            debugLog('[useTerminalWS] NO callback found for terminal')
          }
          break
        }

        case 'terminal:bufferCleared': {
          const xterm = xtermMapRef.current.get(message.payload.terminalId)
          if (xterm) {
            // Full terminal reset - clears screen and resets state
            xterm.reset()
          }
          break
        }

        case 'terminal:exit':
          setTerminals((prev) =>
            prev.map((t) =>
              t.id === message.payload.terminalId
                ? { ...t, status: 'exited' as const, exitCode: message.payload.exitCode }
                : t
            )
          )
          break

        case 'terminal:error':
          console.error('Terminal error:', message.payload.error)
          break

        case 'terminal:renamed':
          setTerminals((prev) =>
            prev.map((t) =>
              t.id === message.payload.terminalId
                ? { ...t, name: message.payload.name }
                : t
            )
          )
          break

        case 'terminal:destroyed':
          xtermMapRef.current.delete(message.payload.terminalId)
          setTerminals((prev) => prev.filter((t) => t.id !== message.payload.terminalId))
          break

        case 'terminal:tabAssigned':
          setTerminals((prev) =>
            prev.map((t) =>
              t.id === message.payload.terminalId
                ? {
                    ...t,
                    tabId: message.payload.tabId ?? undefined,
                    positionInTab: message.payload.positionInTab,
                  }
                : t
            )
          )
          break

        // Tab messages
        case 'tabs:list':
          setTabs(message.payload.tabs)
          break

        case 'tab:created':
          debugLog('[useTerminalWS] tab:created received', {
            id: message.payload.tab.id,
            name: message.payload.tab.name,
          })
          // Deduplicate: only add if not already present (prevents duplicates from multiple WS clients)
          setTabs((prev) => {
            if (prev.some((t) => t.id === message.payload.tab.id)) {
              debugLog('[useTerminalWS] tab:created SKIPPED (already exists)', {
                id: message.payload.tab.id,
              })
              return prev
            }
            return [...prev, message.payload.tab].sort((a, b) => a.position - b.position)
          })
          break

        case 'tab:renamed':
          setTabs((prev) =>
            prev.map((t) =>
              t.id === message.payload.tabId ? { ...t, name: message.payload.name } : t
            )
          )
          break

        case 'tab:deleted':
          setTabs((prev) => prev.filter((t) => t.id !== message.payload.tabId))
          break

        case 'tab:reordered':
          setTabs((prev) =>
            prev
              .map((t) =>
                t.id === message.payload.tabId ? { ...t, position: message.payload.position } : t
              )
              .sort((a, b) => a.position - b.position)
          )
          break
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error)
    }
  }, [])

  const connect = useCallback(() => {
    // Prevent double connections from React Strict Mode
    const ws = wsRef.current
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return
    }

    const newWs = new WebSocket(url)
    wsRef.current = newWs

    newWs.onopen = () => {
      setConnected(true)
      reconnectAttemptsRef.current = 0
    }

    newWs.onmessage = handleMessage

    newWs.onclose = () => {
      setConnected(false)
      setTerminalsLoaded(false)
      // Only clear ref if this is still the current WebSocket
      if (wsRef.current === newWs) {
        wsRef.current = null
      }

      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++
        reconnectTimeoutRef.current = setTimeout(() => connectRef.current(), reconnectInterval)
      }
    }

    newWs.onerror = () => {}
  }, [url, reconnectInterval, maxReconnectAttempts, handleMessage])

  // Keep ref in sync for recursive calls
  connectRef.current = connect

  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      const ws = wsRef.current
      if (ws) {
        // Don't close WebSocket if it's still connecting - this causes
        // "WebSocket is closed before the connection is established" errors in WebKit.
        // Let it naturally complete or fail, then it will close on its own.
        if (ws.readyState === WebSocket.OPEN) {
          ws.close()
        }
        wsRef.current = null
      }
    }
  }, [connect])

  // Restore focus after reconnection
  useEffect(() => {
    if (connected && !wasConnectedRef.current) {
      // Just reconnected - restore focus after short delay for attachments to complete
      const timeoutId = setTimeout(() => {
        if (
          lastFocusedTerminalRef.current &&
          document.hasFocus() &&
          document.visibilityState === 'visible'
        ) {
          const xterm = xtermMapRef.current.get(lastFocusedTerminalRef.current)
          xterm?.focus()
        }
      }, 150)
      return () => clearTimeout(timeoutId)
    }
    wasConnectedRef.current = connected
  }, [connected])

  // Terminal operations
  const createTerminal = useCallback(
    (options: CreateTerminalOptions) => {
      send({
        type: 'terminal:create',
        payload: options,
      })
    },
    [send]
  )

  const destroyTerminal = useCallback(
    (terminalId: string) => {
      send({
        type: 'terminal:destroy',
        payload: { terminalId },
      })
      xtermMapRef.current.delete(terminalId)
      setTerminals((prev) => prev.filter((t) => t.id !== terminalId))
    },
    [send]
  )

  const writeToTerminal = useCallback(
    (terminalId: string, data: string) => {
      debugLog('[useTerminalWS] writeToTerminal called', {
        terminalId,
        dataLen: data.length,
        wsReadyState: wsRef.current?.readyState,
      })
      send({
        type: 'terminal:input',
        payload: { terminalId, data },
      })
    },
    [send]
  )

  // Send text input followed by Enter key to terminal (for CLI tools like Claude Code)
  const sendInputToTerminal = useCallback(
    (terminalId: string, text: string) => {
      // Write the text first
      send({
        type: 'terminal:input',
        payload: { terminalId, data: text },
      })
      // Then send Enter (\r) after a brief delay to ensure text is processed first
      setTimeout(() => {
        send({
          type: 'terminal:input',
          payload: { terminalId, data: '\r' },
        })
      }, 50)
    },
    [send]
  )

  const resizeTerminal = useCallback(
    (terminalId: string, cols: number, rows: number) => {
      send({
        type: 'terminal:resize',
        payload: { terminalId, cols, rows },
      })
    },
    [send]
  )

  const renameTerminal = useCallback(
    (terminalId: string, name: string) => {
      send({
        type: 'terminal:rename',
        payload: { terminalId, name },
      })
    },
    [send]
  )

  const clearTerminalBuffer = useCallback(
    (terminalId: string) => {
      send({
        type: 'terminal:clearBuffer',
        payload: { terminalId },
      })
    },
    [send]
  )

  const assignTerminalToTab = useCallback(
    (terminalId: string, tabId: string | null, positionInTab?: number) => {
      send({
        type: 'terminal:assignTab',
        payload: { terminalId, tabId, positionInTab },
      })
    },
    [send]
  )

  // Tab operations
  const createTab = useCallback(
    (name: string, position?: number) => {
      send({
        type: 'tab:create',
        payload: { name, position },
      })
    },
    [send]
  )

  const renameTab = useCallback(
    (tabId: string, name: string) => {
      send({
        type: 'tab:rename',
        payload: { tabId, name },
      })
    },
    [send]
  )

  const deleteTab = useCallback(
    (tabId: string) => {
      send({
        type: 'tab:delete',
        payload: { tabId },
      })
    },
    [send]
  )

  const reorderTab = useCallback(
    (tabId: string, position: number) => {
      send({
        type: 'tab:reorder',
        payload: { tabId, position },
      })
    },
    [send]
  )

  const attachXterm = useCallback(
    (terminalId: string, xterm: XTerm, options?: AttachXtermOptions) => {
      xtermMapRef.current.set(terminalId, xterm)

      // Handle Shift+Enter to insert a newline for Claude Code multi-line input
      xterm.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        if (event.type === 'keydown' && event.shiftKey && event.key === 'Enter') {
          event.preventDefault()
          event.stopPropagation()
          writeToTerminal(terminalId, '\n')
          return false // Prevent xterm from processing (would send regular CR)
        }
        return true // Allow all other keys to be processed normally
      })

      // Set up input handling
      const disposable = xterm.onData((data) => {
        writeToTerminal(terminalId, data)
      })

      // Track focus for reconnection restoration
      const handleFocus = () => {
        lastFocusedTerminalRef.current = terminalId
      }
      xterm.textarea?.addEventListener('focus', handleFocus)

      // Register onAttached callback if provided
      if (options?.onAttached) {
        debugLog('[useTerminalWS] registering onAttached callback for', terminalId)
        onAttachedCallbacksRef.current.set(terminalId, options.onAttached)
      }

      // Request attachment to get buffer
      send({
        type: 'terminal:attach',
        payload: { terminalId },
      })

      // Return cleanup function
      // Note: Don't delete onAttached callback here - it needs to persist until
      // the server responds with terminal:attached. The callback is deleted
      // after being called in handleMessage.
      return () => {
        disposable.dispose()
        xtermMapRef.current.delete(terminalId)
        xterm.textarea?.removeEventListener('focus', handleFocus)
      }
    },
    [send, writeToTerminal]
  )

  const setupImagePaste = useCallback(
    (container: HTMLElement, terminalId: string) => {
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
              writeToTerminal(terminalId, path)
            } catch (error) {
              console.error('Failed to upload image:', error)
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
    },
    [writeToTerminal]
  )

  return {
    terminals,
    terminalsLoaded,
    tabs,
    connected,
    newTerminalIds: newTerminalIdsRef.current,
    createTerminal,
    destroyTerminal,
    writeToTerminal,
    sendInputToTerminal,
    resizeTerminal,
    renameTerminal,
    clearTerminalBuffer,
    assignTerminalToTab,
    createTab,
    renameTab,
    deleteTab,
    reorderTab,
    attachXterm,
    setupImagePaste,
  }
}
