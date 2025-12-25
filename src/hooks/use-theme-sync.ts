import { useEffect, useCallback, useRef } from 'react'
import { useTheme as useNextTheme } from 'next-themes'
import { useTheme, useSyncClaudeCodeTheme, useSyncStarshipTheme, useUpdateConfig, CONFIG_KEYS, type Theme } from './use-config'
import { fetchJSON } from '@/lib/api'

/**
 * Hook to sync theme between next-themes and backend settings.
 * - On mount: applies saved theme preference from backend
 * - Provides changeTheme function to update both next-themes and backend
 * - Optionally syncs theme to Claude Code config when enabled
 */
export function useThemeSync() {
  const { setTheme, resolvedTheme, theme: currentTheme } = useNextTheme()
  const { data: savedTheme, isSuccess } = useTheme()
  const { data: syncClaudeCode } = useSyncClaudeCodeTheme()
  const { data: syncStarship } = useSyncStarshipTheme()
  const updateConfig = useUpdateConfig()
  const prevResolvedTheme = useRef<string | undefined>(undefined)
  const prevSyncClaudeCode = useRef<boolean | undefined>(undefined)
  const prevSyncStarship = useRef<boolean | undefined>(undefined)
  const hasInitialized = useRef(false)

  // Apply saved theme on mount (if different from current)
  useEffect(() => {
    if (isSuccess && savedTheme && savedTheme !== currentTheme) {
      setTheme(savedTheme)
    }
  }, [isSuccess, savedTheme, currentTheme, setTheme])

  // Sync to external tools when:
  // 1. Resolved theme changes (if any sync is enabled)
  // 2. A sync setting is toggled on after initial load (immediate sync with current theme)
  // The backend endpoint handles syncing to both Claude Code and Starship
  useEffect(() => {
    const shouldSync = syncClaudeCode || syncStarship
    const themeChanged = resolvedTheme && resolvedTheme !== prevResolvedTheme.current

    // Only detect "just enabled" after initial render to avoid syncing on page load
    const syncJustEnabled = hasInitialized.current && (
      (syncClaudeCode && prevSyncClaudeCode.current === false) ||
      (syncStarship && prevSyncStarship.current === false)
    )

    // Update refs
    prevResolvedTheme.current = resolvedTheme
    prevSyncClaudeCode.current = syncClaudeCode
    prevSyncStarship.current = syncStarship
    hasInitialized.current = true

    // Sync if theme changed while sync is enabled, or if sync was just enabled
    if (resolvedTheme && shouldSync && (themeChanged || syncJustEnabled)) {
      // Fire and forget - no need to await
      fetchJSON('/api/config/sync-claude-theme', {
        method: 'POST',
        body: JSON.stringify({ resolvedTheme }),
      }).catch(() => {
        // Silently ignore sync errors
      })
    }
  }, [resolvedTheme, syncClaudeCode, syncStarship])

  // Function to change theme and persist to backend
  const changeTheme = useCallback(
    (theme: Theme) => {
      setTheme(theme)
      // Persist to backend (empty string for system/null)
      updateConfig.mutate({
        key: CONFIG_KEYS.THEME,
        value: theme === 'system' ? '' : theme,
      })
    },
    [setTheme, updateConfig]
  )

  return {
    theme: (currentTheme as Theme) ?? 'system',
    resolvedTheme: resolvedTheme as 'light' | 'dark' | undefined,
    savedTheme,
    syncClaudeCode,
    syncStarship,
    changeTheme,
    isUpdating: updateConfig.isPending,
  }
}
