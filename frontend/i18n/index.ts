import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// Import English translations
import enCommon from './locales/en/common.json'
import enNavigation from './locales/en/navigation.json'
import enTasks from './locales/en/tasks.json'
import enSettings from './locales/en/settings.json'
import enReview from './locales/en/review.json'
import enWorktrees from './locales/en/worktrees.json'
import enMonitoring from './locales/en/monitoring.json'
import enTerminals from './locales/en/terminals.json'
import enRepositories from './locales/en/repositories.json'
import enJobs from './locales/en/jobs.json'
import enProjects from './locales/en/projects.json'
import enAssistant from './locales/en/assistant.json'

// Import Chinese translations
import zhCommon from './locales/zh/common.json'
import zhNavigation from './locales/zh/navigation.json'
import zhTasks from './locales/zh/tasks.json'
import zhSettings from './locales/zh/settings.json'
import zhReview from './locales/zh/review.json'
import zhWorktrees from './locales/zh/worktrees.json'
import zhMonitoring from './locales/zh/monitoring.json'
import zhTerminals from './locales/zh/terminals.json'
import zhRepositories from './locales/zh/repositories.json'
import zhProjects from './locales/zh/projects.json'
import zhAssistant from './locales/zh/assistant.json'

export const defaultNS = 'common'
export const supportedLanguages = ['en', 'zh'] as const
export type SupportedLanguage = (typeof supportedLanguages)[number]

export const resources = {
  en: {
    common: enCommon,
    navigation: enNavigation,
    tasks: enTasks,
    settings: enSettings,
    review: enReview,
    worktrees: enWorktrees,
    monitoring: enMonitoring,
    terminals: enTerminals,
    repositories: enRepositories,
    jobs: enJobs,
    projects: enProjects,
    assistant: enAssistant,
  },
  zh: {
    common: zhCommon,
    navigation: zhNavigation,
    tasks: zhTasks,
    settings: zhSettings,
    review: zhReview,
    worktrees: zhWorktrees,
    monitoring: zhMonitoring,
    terminals: zhTerminals,
    repositories: zhRepositories,
    jobs: enJobs, // TODO: Add Chinese translations
    projects: zhProjects,
    assistant: zhAssistant,
  },
} as const

// Get initial language from localStorage or use browser detection
function getInitialLanguage(): SupportedLanguage {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('fulcrum-language')
    if (stored && supportedLanguages.includes(stored as SupportedLanguage)) {
      return stored as SupportedLanguage
    }
    // Auto-detect from browser
    const browserLang = navigator.language.split('-')[0]
    if (supportedLanguages.includes(browserLang as SupportedLanguage)) {
      return browserLang as SupportedLanguage
    }
  }
  return 'en'
}

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  defaultNS,
  ns: ['common', 'navigation', 'tasks', 'settings', 'review', 'worktrees', 'monitoring', 'terminals', 'repositories', 'jobs', 'projects', 'assistant'],
  interpolation: {
    escapeValue: false, // React already escapes
  },
})

// Persist language changes to localStorage
i18n.on('languageChanged', (lng) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('fulcrum-language', lng)
  }
})

export default i18n
