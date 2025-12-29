import { useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { useStore } from '@/stores'

interface NotificationPayload {
  id: string
  title: string
  message: string
  notificationType: 'success' | 'info' | 'warning' | 'error'
  taskId?: string
  playSound?: boolean
  isCustomSound?: boolean
}

/**
 * Hook to sync task updates and handle notifications via the shared WebSocket.
 *
 * Instead of creating its own WebSocket connection, this hook subscribes to
 * events from the MST store which manages the single shared WebSocket.
 */
export function useTaskSync() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { resolvedTheme } = useTheme()
  const store = useStore()

  // Handle task updates by invalidating the tasks query
  const handleTaskUpdate = useCallback(
    () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    [queryClient]
  )

  // Handle notifications with deduplication and toast display
  const handleNotification = useCallback(
    (notification: NotificationPayload) => {
      const { id, title, message: description, notificationType, taskId, playSound, isCustomSound } = notification

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
        // Determine icon: goat if default sound enabled, otherwise theme-appropriate logo
        const useGoat = playSound && !isCustomSound
        const iconUrl = useGoat
          ? '/goat.jpeg'
          : resolvedTheme === 'dark'
            ? '/logo-dark.jpg'
            : '/logo-light.jpg'

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

        // Show browser notification (skip in iframe - desktop app handles natively)
        if ('Notification' in window && window.parent === window && Notification.permission === 'granted') {
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
          const soundClaim = `${now}:${Math.random().toString(36).slice(2)}`
          localStorage.setItem(storageKey, soundClaim)

          // Wait for all tabs to write their claims, then check if we won
          setTimeout(() => {
            if (localStorage.getItem(storageKey) !== soundClaim) {
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
      }
    },
    [navigate, resolvedTheme]
  )

  // Request browser notification permission on first load
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Subscribe to store events
  useEffect(() => {
    const unsubscribeTask = store.onTaskUpdate(handleTaskUpdate)
    const unsubscribeNotification = store.onNotification(handleNotification)

    return () => {
      unsubscribeTask()
      unsubscribeNotification()
    }
  }, [store, handleTaskUpdate, handleNotification])
}
