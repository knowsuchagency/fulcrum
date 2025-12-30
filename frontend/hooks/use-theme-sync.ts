import { useEffect, useCallback, useRef } from 'react'
import { useTheme as useNextTheme } from 'next-themes'
import { useSyncClaudeCodeTheme, type Theme } from './use-config'
import { useStore } from '@/stores'
import { fetchJSON } from '@/lib/api'
import { reaction } from 'mobx'

/**
 * Hook to sync theme across all clients via WebSocket.
 * - Listens for theme:synced messages from server
 * - Broadcasts theme changes to all connected clients
 * - Optionally syncs theme to Claude Code config when enabled
 */
export function useThemeSync() {
  const store = useStore()
  const { setTheme, resolvedTheme, theme: currentTheme } = useNextTheme()
  const { data: syncClaudeCode } = useSyncClaudeCodeTheme()
  const prevSyncClaudeCode = useRef<boolean | undefined>(undefined)
  const hasInitialized = useRef(false)

  // Track if we're applying a broadcasted theme (to skip re-broadcasting)
  const isApplyingBroadcast = useRef(false)

  // Use MobX reaction to listen for broadcasted theme changes
  // This properly observes MST volatile state
  useEffect(() => {
    const dispose = reaction(
      () => store.broadcastedTheme,
      (broadcastedTheme) => {
        if (broadcastedTheme) {
          isApplyingBroadcast.current = true
          setTheme(broadcastedTheme)
          store.clearBroadcastedTheme()
          // Reset flag after a tick to allow changeTheme to work normally
          setTimeout(() => {
            isApplyingBroadcast.current = false
          }, 0)
        }
      },
      { fireImmediately: true }
    )
    return dispose
  }, [store, setTheme])

  // Update favicon
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.type = 'image/jpeg'
    link.href = '/logo.jpg'
  }, [])

  // Sync to Claude Code when sync setting is toggled on (immediate sync with current theme)
  useEffect(() => {
    const syncJustEnabled = hasInitialized.current && syncClaudeCode && prevSyncClaudeCode.current === false

    prevSyncClaudeCode.current = syncClaudeCode
    hasInitialized.current = true

    if (resolvedTheme && syncJustEnabled) {
      fetchJSON('/api/config/sync-claude-theme', {
        method: 'POST',
        body: JSON.stringify({ resolvedTheme }),
      }).catch(() => {})
    }
  }, [syncClaudeCode, resolvedTheme])

  // Function to change theme and broadcast to all clients
  const changeTheme = useCallback(
    (theme: Theme) => {
      // Skip if this is from a broadcast (prevents feedback loop)
      if (isApplyingBroadcast.current) return

      setTheme(theme)

      // Broadcast via WebSocket to all clients (server also persists to settings)
      store.syncTheme(theme)

      // Sync to Claude Code if enabled (only on explicit user action)
      if (syncClaudeCode) {
        const effectiveTheme = theme === 'system'
          ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : theme
        fetchJSON('/api/config/sync-claude-theme', {
          method: 'POST',
          body: JSON.stringify({ resolvedTheme: effectiveTheme }),
        }).catch(() => {})
      }
    },
    [setTheme, store, syncClaudeCode]
  )

  return {
    theme: (currentTheme as Theme) ?? 'system',
    resolvedTheme: resolvedTheme as 'light' | 'dark' | undefined,
    syncClaudeCode,
    changeTheme,
    isUpdating: false,
  }
}
