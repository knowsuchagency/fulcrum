import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { RootStore, type IRootStore, type StoreEnv } from './root-store'
import { log } from '@/lib/logger'

// Re-export types
export type { IRootStore } from './root-store'
export type { ITerminal, ITerminalSnapshot, ITab, ITabSnapshot, IViewState } from './models'

// Re-export hooks
export { useTerminalStore } from './hooks'
export type { UseTerminalStoreReturn } from './hooks'

export {
  useFilesStore,
  useFilesStoreActions,
  useCreateFilesStore,
  FilesStoreContext,
} from './hooks'
export type { UseFilesStoreReturn } from './hooks'

// Re-export files store for direct use
export { FilesStore, createFilesStore } from './files-store'
export type { IFilesStore, IFile } from './files-store'

// Re-export deployment store
export { useDeploymentStore, DeploymentStoreProvider } from './hooks/use-deployment-store'
export { DeploymentStreamStore } from './deployment-store'
export type { IDeploymentStreamStore, DeploymentStage, Deployment } from './deployment-store'

/**
 * React context for the MST store
 */
const StoreContext = createContext<IRootStore | null>(null)

/**
 * Hook to access the store
 */
export function useStore(): IRootStore {
  const store = useContext(StoreContext)
  if (!store) {
    throw new Error('useStore must be used within a StoreProvider')
  }
  return store
}

/**
 * Construct WebSocket URL based on current location
 */
function getDefaultWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/terminal`
}

interface StoreProviderProps {
  children: ReactNode
  /** WebSocket URL (defaults to current host) */
  wsUrl?: string
  /** Reconnect interval in ms (default: 2000) */
  reconnectInterval?: number
  /** Max reconnect attempts (default: 10) */
  maxReconnectAttempts?: number
}

/**
 * Provider component that creates and manages the MST store.
 *
 * This provider:
 * 1. Creates the store with WebSocket environment
 * 2. Manages WebSocket connection lifecycle
 * 3. Routes incoming messages to store actions
 * 4. Handles reconnection with exponential backoff
 */
export function StoreProvider({
  children,
  wsUrl = getDefaultWsUrl(),
  reconnectInterval = 2000,
  maxReconnectAttempts = 10,
}: StoreProviderProps) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const storeRef = useRef<IRootStore | null>(null)
  const [, forceUpdate] = useState({})

  // Create send function that will be injected into store
  const send = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      log.ws.debug('send', { type: (message as { type?: string }).type })
      wsRef.current.send(JSON.stringify(message))
    } else {
      log.ws.warn('send dropped (WebSocket not open)', {
        type: (message as { type?: string }).type,
        readyState: wsRef.current?.readyState ?? 'no socket',
      })
    }
  }, [])

  // Create store once with environment
  if (!storeRef.current) {
    const env: StoreEnv = { send, log }
    storeRef.current = RootStore.create({}, env)
  }
  const store = storeRef.current

  // Sync maxReconnectAttempts to store for UI access
  useEffect(() => {
    store.setMaxReconnectAttempts(maxReconnectAttempts)
  }, [store, maxReconnectAttempts])

  // WebSocket connection management
  useEffect(() => {
    let mounted = true

    const connect = () => {
      // Prevent double connections
      const ws = wsRef.current
      if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        return
      }

      const newWs = new WebSocket(wsUrl)
      wsRef.current = newWs

      newWs.onopen = () => {
        if (!mounted) return
        log.ws.info('WebSocket connected')
        store.setConnected(true)
        reconnectAttemptsRef.current = 0
      }

      newWs.onmessage = (event) => {
        if (!mounted) return
        try {
          const message = JSON.parse(event.data)
          store.handleMessage(message)
        } catch (error) {
          log.ws.error('Failed to parse WebSocket message', { error: String(error) })
        }
      }

      newWs.onclose = () => {
        if (!mounted) return
        log.ws.info('WebSocket disconnected')
        store.setConnected(false)

        // Only clear ref if this is still the current WebSocket
        if (wsRef.current === newWs) {
          wsRef.current = null
        }

        // Attempt reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++
          store.setReconnectAttempt(reconnectAttemptsRef.current)
          const delay = reconnectInterval * Math.pow(1.5, reconnectAttemptsRef.current - 1)
          log.ws.info('Scheduling reconnect', {
            attempt: reconnectAttemptsRef.current,
            delay,
          })
          reconnectTimeoutRef.current = setTimeout(connect, delay)
        } else {
          log.ws.warn('Max reconnect attempts reached')
          store.setReconnectAttempt(reconnectAttemptsRef.current)
        }
      }

      newWs.onerror = (event) => {
        log.ws.error('WebSocket error', { event: String(event) })
      }
    }

    connect()

    return () => {
      mounted = false
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        ws.close()
      }
      wsRef.current = null
    }
  }, [wsUrl, reconnectInterval, maxReconnectAttempts, store])

  // Force re-render when store is created
  useEffect(() => {
    forceUpdate({})
  }, [])

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

/**
 * Hook to check if store is ready (connected and initialized)
 */
export function useStoreReady(): boolean {
  const store = useStore()
  return store.isReady
}

/**
 * Hook to get connection status
 */
export function useStoreConnected(): boolean {
  const store = useStore()
  return store.connected
}
