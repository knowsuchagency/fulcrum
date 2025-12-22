import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface TaskUpdatedMessage {
  type: 'task:updated'
  payload: { taskId: string }
}

interface NotificationMessage {
  type: 'notification'
  payload: {
    id: string
    title: string
    message: string
    notificationType: 'success' | 'info' | 'warning' | 'error'
    taskId?: string
  }
}

type ServerMessage = TaskUpdatedMessage | NotificationMessage | { type: string }

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
  const connectRef = useRef<(() => void) | undefined>(undefined)

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: ServerMessage = JSON.parse(event.data)
        if (message.type === 'task:updated') {
          queryClient.invalidateQueries({ queryKey: ['tasks'] })
        } else if (message.type === 'notification' && 'payload' in message) {
          const { title, message: description, notificationType } = (message as NotificationMessage).payload
          switch (notificationType) {
            case 'success':
              toast.success(title, { description })
              break
            case 'error':
              toast.error(title, { description })
              break
            case 'warning':
              toast.warning(title, { description })
              break
            case 'info':
            default:
              toast.info(title, { description })
              break
          }
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
