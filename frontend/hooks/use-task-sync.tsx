import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTheme } from 'next-themes'
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
    showToast?: boolean
    showDesktop?: boolean
    playSound?: boolean
    isCustomSound?: boolean
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
  const navigate = useNavigate()
  const { resolvedTheme } = useTheme()
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
          const { id, title, message: description, notificationType, taskId, showToast, showDesktop, playSound, isCustomSound } = (message as NotificationMessage).payload

          // Deduplicate notifications across tabs using localStorage
          // Use a claim mechanism similar to sound deduplication
          const NOTIFICATION_CLAIM_KEY = `vibora:notification:${id}`
          const CLAIM_SETTLE_MS = 50
          const CLAIM_TTL_MS = 10000 // Clean up old claims after 10s

          // Check if another tab already claimed this notification
          const existingClaim = localStorage.getItem(NOTIFICATION_CLAIM_KEY)
          if (existingClaim) {
            return // Another tab already showing this notification
          }

          // Make our claim
          const myClaim = `${Date.now()}:${Math.random().toString(36).slice(2)}`
          localStorage.setItem(NOTIFICATION_CLAIM_KEY, myClaim)

          // Wait for all tabs to write their claims, then check if we won
          setTimeout(() => {
            if (localStorage.getItem(NOTIFICATION_CLAIM_KEY) !== myClaim) {
              return // Another tab won the race
            }

            // Clean up claim after TTL
            setTimeout(() => localStorage.removeItem(NOTIFICATION_CLAIM_KEY), CLAIM_TTL_MS)

            // We won - show the notification
            showNotification()
          }, CLAIM_SETTLE_MS)

          function showNotification() {
            // Determine icon: goat if default sound enabled, otherwise logo
          const useGoat = playSound && !isCustomSound
          const iconUrl = useGoat ? '/goat.jpeg' : '/logo.png'

          // Show in-app toast if enabled (default: true for backward compatibility)
          if (showToast !== false) {
            // Create icon element for toast
            const icon = (
              <img
                src={iconUrl}
                alt=""
                className="size-8 shrink-0 aspect-square rounded-sm object-cover"
              />
            )

            // Build toast options with optional action for navigation
            const toastOptions: Parameters<typeof toast.success>[1] = {
              description,
              icon,
              ...(taskId && {
                action: {
                  label: 'View',
                  onClick: () => navigate({ to: '/tasks/$taskId', params: { taskId } }),
                },
              }),
            }

            // Show toast with custom icon and optional action
            switch (notificationType) {
              case 'success':
                toast.success(title, toastOptions)
                break
              case 'error':
                toast.error(title, toastOptions)
                break
              case 'warning':
                toast.warning(title, toastOptions)
                break
              case 'info':
              default:
                toast.info(title, toastOptions)
                break
            }
          }

          // Show browser notification if enabled (skip in iframe - desktop app handles natively)
          // Default: true for backward compatibility
          if (showDesktop !== false && 'Notification' in window && window.parent === window && Notification.permission === 'granted') {
            new Notification(title, {
              body: description,
              icon: iconUrl,
              tag: id,
            })
          }

          // Play notification sound if enabled
          // Try custom sound first (/api/uploads/sound), fall back to default
          // Use localStorage claim mechanism to prevent multiple tabs from playing
          if (playSound) {
            const SOUND_DEBOUNCE_MS = 1000
            const CLAIM_SETTLE_MS = 50
            const storageKey = 'vibora:lastSoundPlayed'
            const now = Date.now()

            // Parse existing claim (format: "timestamp:randomId")
            const existing = localStorage.getItem(storageKey)
            if (existing) {
              const ts = parseInt(existing.split(':')[0])
              if (now - ts < SOUND_DEBOUNCE_MS) {
                return // Recent play, skip
              }
            }

            // Make our claim with timestamp:randomId for uniqueness
            const myClaim = `${now}:${Math.random().toString(36).slice(2)}`
            localStorage.setItem(storageKey, myClaim)

            // Wait for all tabs to write their claims, then check if we won
            setTimeout(() => {
              if (localStorage.getItem(storageKey) !== myClaim) {
                return // Another tab won the race
              }

              // We won - play the sound
              let fellBack = false
              const playDefault = () => {
                if (fellBack) return
                fellBack = true
                const defaultAudio = new Audio('/sounds/goat-bleat.mp3')
                defaultAudio.play().catch(() => {})
              }
              const customAudio = new Audio('/api/uploads/sound')
              customAudio.onerror = playDefault
              customAudio.play().catch(playDefault)
            }, CLAIM_SETTLE_MS)
          }

          // Post to parent window for desktop native notifications
          if (window.parent !== window) {
            window.parent.postMessage(
              { type: 'vibora:notification', title, message: description, notificationType },
              '*'
            )
          }
          } // end showNotification
        }
      } catch {
        // Ignore parse errors
      }
    },
    [queryClient, navigate, resolvedTheme]
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

  // Request browser notification permission on first load
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

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
}
