import { useEffect, useCallback, useRef } from 'react'
import { useTheme as useNextTheme } from 'next-themes'
import { useTheme, useSyncClaudeCodeTheme, useUpdateConfig, CONFIG_KEYS, type Theme } from './use-config'
import { fetchJSON } from '@/lib/api'

/**
 * Hook to sync theme between next-themes and backend settings.
 * - On mount: applies saved theme preference from backend
 * - Provides changeTheme function to update both next-themes and backend
 * - Optionally syncs theme to Claude Code config when enabled (only on explicit user action)
 */
export function useThemeSync() {
  const { setTheme, resolvedTheme, theme: currentTheme } = useNextTheme()
  const { data: savedTheme, isSuccess } = useTheme()
  const { data: syncClaudeCode } = useSyncClaudeCodeTheme()
  const updateConfig = useUpdateConfig()
  const prevSyncClaudeCode = useRef<boolean | undefined>(undefined)
  const hasInitialized = useRef(false)

  // Apply saved theme on mount (if different from current)
  useEffect(() => {
    if (isSuccess && savedTheme && savedTheme !== currentTheme) {
      setTheme(savedTheme)
    }
  }, [isSuccess, savedTheme, currentTheme, setTheme])

  // Update favicon based on resolved theme
  useEffect(() => {
    if (!resolvedTheme) return

    const favicon = resolvedTheme === 'dark' ? '/logo-dark.jpg' : '/logo-light.jpg'

    // Update or create the favicon link element
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.type = 'image/jpeg'
    link.href = favicon
  }, [resolvedTheme])

  // Sync to Claude Code when sync setting is toggled on (immediate sync with current theme)
  // NOTE: We intentionally do NOT sync on resolvedTheme changes here to avoid a feedback loop
  // when multiple tabs are open. Cross-tab theme sync is handled by next-themes via localStorage.
  // Claude sync only happens on explicit user action (changeTheme) or when enabling the toggle.
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

  // Function to change theme and persist to backend
  const changeTheme = useCallback(
    (theme: Theme) => {
      setTheme(theme)
      // Persist to backend (empty string for system/null)
      updateConfig.mutate({
        key: CONFIG_KEYS.THEME,
        value: theme === 'system' ? '' : theme,
      })

      // Sync to Claude Code if enabled (only on explicit user action, not cross-tab sync)
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
    [setTheme, updateConfig, syncClaudeCode]
  )

  return {
    theme: (currentTheme as Theme) ?? 'system',
    resolvedTheme: resolvedTheme as 'light' | 'dark' | undefined,
    savedTheme,
    syncClaudeCode,
    changeTheme,
    isUpdating: updateConfig.isPending,
  }
}
