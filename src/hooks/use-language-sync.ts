import { useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage, useUpdateConfig, CONFIG_KEYS, type Language } from './use-config'
import { supportedLanguages, type SupportedLanguage } from '@/i18n'

/**
 * Hook to sync language between i18n and backend settings.
 * - On mount: applies saved language preference from backend
 * - Provides changeLanguage function to update both i18n and backend
 */
export function useLanguageSync() {
  const { i18n } = useTranslation()
  const { data: savedLanguage, isSuccess } = useLanguage()
  const updateConfig = useUpdateConfig()

  // Apply saved language on mount (if different from current)
  useEffect(() => {
    if (isSuccess && savedLanguage && savedLanguage !== i18n.language) {
      i18n.changeLanguage(savedLanguage)
    }
  }, [isSuccess, savedLanguage, i18n])

  // Function to change language and persist to backend
  const changeLanguage = useCallback(
    async (lang: Language) => {
      if (lang) {
        // Specific language selected
        await i18n.changeLanguage(lang)
      } else {
        // Auto-detect: use browser language or fallback to 'en'
        const browserLang = navigator.language.split('-')[0] as SupportedLanguage
        const detectedLang = supportedLanguages.includes(browserLang) ? browserLang : 'en'
        await i18n.changeLanguage(detectedLang)
      }
      // Persist to backend (empty string for null/auto)
      updateConfig.mutate({
        key: CONFIG_KEYS.LANGUAGE,
        value: lang ?? '',
      })
    },
    [i18n, updateConfig]
  )

  return {
    language: i18n.language as SupportedLanguage,
    savedLanguage,
    changeLanguage,
    isUpdating: updateConfig.isPending,
  }
}
