import { useEffect, useCallback } from 'react'
import { useTheme as useNextTheme } from 'next-themes'
import { useTheme, useUpdateConfig, CONFIG_KEYS, type Theme } from './use-config'

/**
 * Hook to sync theme between next-themes and backend settings.
 * - On mount: applies saved theme preference from backend
 * - Provides changeTheme function to update both next-themes and backend
 */
export function useThemeSync() {
  const { setTheme, resolvedTheme, theme: currentTheme } = useNextTheme()
  const { data: savedTheme, isSuccess } = useTheme()
  const updateConfig = useUpdateConfig()

  // Apply saved theme on mount (if different from current)
  useEffect(() => {
    if (isSuccess && savedTheme && savedTheme !== currentTheme) {
      setTheme(savedTheme)
    }
  }, [isSuccess, savedTheme, currentTheme, setTheme])

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
    changeTheme,
    isUpdating: updateConfig.isPending,
  }
}
