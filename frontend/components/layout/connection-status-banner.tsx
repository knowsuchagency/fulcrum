import { observer } from 'mobx-react-lite'
import { useStore } from '@/stores'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert02Icon, Loading03Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

/**
 * Banner shown when WebSocket connection to the server is lost.
 * Displays reconnection status and error state.
 *
 * Only shows after initial connection has been established to avoid
 * flashing during initial page load.
 */
export const ConnectionStatusBanner = observer(function ConnectionStatusBanner() {
  const store = useStore()

  // Don't show banner if connected
  if (store.connected) {
    return null
  }

  // Don't show banner before first successful connection
  // This prevents showing "disconnected" during initial page load
  if (!store.hasEverConnected) {
    return null
  }

  const isReconnecting =
    store.reconnectAttempt > 0 && store.reconnectAttempt < store.maxReconnectAttempts
  const hasExhaustedAttempts = store.reconnectAttempt >= store.maxReconnectAttempts

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium',
        'border-b animate-in slide-in-from-top-2 fade-in duration-200',
        hasExhaustedAttempts
          ? 'bg-destructive/10 border-destructive/30 text-destructive'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
      )}
      role="alert"
      aria-live="polite"
    >
      {hasExhaustedAttempts ? (
        <>
          <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} />
          <span>Connection lost. Please check if the server is running.</span>
        </>
      ) : isReconnecting ? (
        <>
          <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="animate-spin" />
          <span>
            Reconnecting... (attempt {store.reconnectAttempt}/{store.maxReconnectAttempts})
          </span>
        </>
      ) : (
        <>
          <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} />
          <span>Disconnected from server</span>
        </>
      )}
    </div>
  )
})
