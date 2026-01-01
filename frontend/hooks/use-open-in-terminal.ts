import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useStore } from '@/stores'
import { log } from '@/lib/logger'

/**
 * Hook for opening a repository in a dedicated terminal tab.
 *
 * Behavior:
 * 1. If terminal exists for directory (with or without tab), reuses it
 * 2. If tab exists for directory, navigates to it
 * 3. If not found, creates tab and navigates to /terminals
 *    (the terminals page creates the terminal via lastCreatedTabId)
 */
export function useOpenInTerminal() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const store = useStore()

  const openInTerminal = useCallback(
    (directory: string, name: string) => {
      log.ws.info('useOpenInTerminal: openInTerminal called', {
        directory,
        name,
        connected: store.connected,
        tabCount: store.tabs.items.length,
        terminalCount: store.terminals.items.length,
      })

      if (!store.connected) {
        log.ws.warn('useOpenInTerminal: not connected, aborting')
        toast.error(t('errors.terminalNotConnected'), {
          description: t('errors.terminalNotConnectedDesc'),
        })
        return
      }

      // Check if terminal with this directory already exists (e.g., from repository detail view)
      const existingTerminal = store.terminals.items.find((t) => t.cwd === directory)

      if (existingTerminal) {
        if (existingTerminal.tabId) {
          // Terminal already in a tab - navigate to it
          log.ws.info('useOpenInTerminal: navigating to terminal tab', { terminalId: existingTerminal.id, tabId: existingTerminal.tabId })
          navigate({ to: '/terminals', search: { tab: existingTerminal.tabId } })
          return
        }
        // Orphan terminal (no tab) - create tab and adopt it
        log.ws.info('useOpenInTerminal: adopting orphan terminal into new tab', { terminalId: existingTerminal.id, name, directory })
        store.createTab(name, undefined, directory, existingTerminal.id)
        navigate({ to: '/terminals', search: { tab: store.pendingTabCreation! } })
        return
      }

      // Check if tab with this directory already exists (access store directly for fresh data)
      const existingTab = store.tabs.items.find((t) => t.directory === directory)

      if (existingTab) {
        log.ws.info('useOpenInTerminal: navigating to existing tab', { tabId: existingTab.id })
        navigate({ to: '/terminals', search: { tab: existingTab.id } })
        return
      }

      // Create new tab with directory
      // The terminals page will create the terminal when lastCreatedTabId is set
      log.ws.info('useOpenInTerminal: creating new tab', { name, directory })
      store.createTab(name, undefined, directory)

      // Navigate with tempId to show correct tab immediately
      // The terminals page will update URL to real ID when server confirms
      navigate({ to: '/terminals', search: { tab: store.pendingTabCreation! } })
    },
    [store, navigate, t]
  )

  return { openInTerminal, connected: store.connected }
}
