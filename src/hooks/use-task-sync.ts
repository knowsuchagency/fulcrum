import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

interface TaskUpdatedMessage {
  type: 'task:updated'
  payload: { taskId: string }
}

type ServerMessage = TaskUpdatedMessage | { type: string }

function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/terminal`
}

const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_INTERVAL = 2000

export function useTaskSync() {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const reconnectAttemptsRef = useRef(0)
  const connectRef = useRef<() => void>()

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: ServerMessage = JSON.parse(event.data)
        if (message.type === 'task:updated') {
          queryClient.invalidateQueries({ queryKey: ['tasks'] })
        }
      } catch {
        // Ignore parse errors
      }
    },
    [queryClient]
  )

  const connect = useCallback(() => {
    // Don't connect if already connected or connecting
    const ws = wsRef.current
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return
    }

    const url = getWsUrl()
    const newWs = new WebSocket(url)
    wsRef.current = newWs

    newWs.onopen = () => {
      reconnectAttemptsRef.current = 0
    }

    newWs.onmessage = handleMessage

    newWs.onclose = () => {
      if (wsRef.current === newWs) {
        wsRef.current = null
      }

      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++
        reconnectTimeoutRef.current = setTimeout(() => {
          connectRef.current?.()
        }, RECONNECT_INTERVAL)
      }
    }

    newWs.onerror = () => {}
  }, [handleMessage])

  // Keep connectRef in sync with connect
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
}
