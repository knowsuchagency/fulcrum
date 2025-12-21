import { useCallback, useEffect, useRef, useState } from 'react'
import type { Terminal as XTerm } from '@xterm/xterm'

// Upload an image file and return the path
async function uploadImage(file: File, targetDir?: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  if (targetDir) {
    formData.append('targetDir', targetDir)
  }

  const response = await fetch('/api/uploads', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error('Failed to upload image')
  }

  const data = await response.json()
  return data.path
}

// Types matching server/types.ts
export type TerminalStatus = 'running' | 'exited' | 'error'

export interface TerminalInfo {
  id: string
  name: string
  cwd: string
  status: TerminalStatus
  exitCode?: number
  cols: number
  rows: number
  createdAt: number
}

type ServerMessage =
  | { type: 'terminal:created'; payload: { terminal: TerminalInfo } }
  | { type: 'terminal:output'; payload: { terminalId: string; data: string } }
  | { type: 'terminal:exit'; payload: { terminalId: string; exitCode: number } }
  | { type: 'terminal:attached'; payload: { terminalId: string; buffer: string } }
  | { type: 'terminals:list'; payload: { terminals: TerminalInfo[] } }
  | { type: 'terminal:error'; payload: { terminalId?: string; error: string } }
  | { type: 'terminal:renamed'; payload: { terminalId: string; name: string } }
  | { type: 'terminal:destroyed'; payload: { terminalId: string } }

interface UseTerminalWSOptions {
  url?: string
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

interface UseTerminalWSReturn {
  terminals: TerminalInfo[]
  connected: boolean
  createTerminal: (options: { name: string; cols: number; rows: number; cwd?: string }) => void
  destroyTerminal: (terminalId: string) => void
  writeToTerminal: (terminalId: string, data: string) => void
  resizeTerminal: (terminalId: string, cols: number, rows: number) => void
  renameTerminal: (terminalId: string, name: string) => void
  attachXterm: (terminalId: string, xterm: XTerm) => () => void
  setupImagePaste: (
    container: HTMLElement,
    terminalId: string,
    targetDir?: string
  ) => () => void
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
  const [connected, setConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const xtermMapRef = useRef<Map<string, XTerm>>(new Map())
  const connectRef = useRef<() => void>(() => {})

  const send = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: ServerMessage = JSON.parse(event.data)

      switch (message.type) {
        case 'terminals:list':
          setTerminals(message.payload.terminals)
          break

        case 'terminal:created':
          setTerminals((prev) => [...prev, message.payload.terminal])
          break

        case 'terminal:output': {
          const xterm = xtermMapRef.current.get(message.payload.terminalId)
          if (xterm) {
            xterm.write(message.payload.data)
          }
          break
        }

        case 'terminal:attached': {
          // Buffer is saved to disk but not restored visually due to
          // escape sequence conflicts with dtach's screen refresh
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
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect])

  const createTerminal = useCallback(
    (options: { name: string; cols: number; rows: number; cwd?: string }) => {
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
      send({
        type: 'terminal:input',
        payload: { terminalId, data },
      })
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

  const attachXterm = useCallback(
    (terminalId: string, xterm: XTerm) => {
      xtermMapRef.current.set(terminalId, xterm)

      // Set up input handling
      const disposable = xterm.onData((data) => {
        writeToTerminal(terminalId, data)
      })

      // Request attachment to get buffer
      send({
        type: 'terminal:attach',
        payload: { terminalId },
      })

      // Return cleanup function
      return () => {
        disposable.dispose()
        xtermMapRef.current.delete(terminalId)
      }
    },
    [send, writeToTerminal]
  )

  const setupImagePaste = useCallback(
    (container: HTMLElement, terminalId: string, targetDir?: string) => {
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
              const path = await uploadImage(file, targetDir)
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
    connected,
    createTerminal,
    destroyTerminal,
    writeToTerminal,
    resizeTerminal,
    renameTerminal,
    attachXterm,
    setupImagePaste,
  }
}
