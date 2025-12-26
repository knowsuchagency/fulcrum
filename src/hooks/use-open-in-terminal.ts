import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTerminalWS } from './use-terminal-ws'
import { log } from '@/lib/logger'

/**
 * Hook for opening a repository in a dedicated terminal tab.
 *
 * Behavior:
 * 1. Finds existing tab by directory from synced tabs
 * 2. If not found, creates tab with name and directory
 * 3. Creates terminal in that tab (server uses tab's directory as cwd)
 * 4. Navigates to /terminals?tab={tabId}
 */
export function useOpenInTerminal() {
  const navigate = useNavigate()
  const { tabs, createTab, createTerminal, connected } = useTerminalWS()

  // Track pending operations to handle async tab creation
  const pendingRef = useRef<{
    directory: string
    name: string
  } | null>(null)

  // Watch for new tabs matching our pending directory
  useEffect(() => {
    log.ws.debug('useOpenInTerminal: tabs effect', {
      hasPending: !!pendingRef.current,
      pendingDirectory: pendingRef.current?.directory,
      tabCount: tabs.length,
      tabDirectories: tabs.map(t => t.directory),
    })

    if (!pendingRef.current) return

    const { directory } = pendingRef.current
    const matchingTab = tabs.find((t) => t.directory === directory)

    log.ws.debug('useOpenInTerminal: checking for matching tab', {
      directory,
      matchingTab: matchingTab ? { id: matchingTab.id, name: matchingTab.name } : null,
    })

    if (matchingTab) {
      // Tab found - create terminal and navigate
      pendingRef.current = null

      log.ws.info('useOpenInTerminal: creating terminal in tab', {
        tabId: matchingTab.id,
        directory,
      })

      // Create terminal in the tab (server will use tab's directory as cwd)
      createTerminal({
        name: 'Terminal 1',
        cols: 80,
        rows: 24,
        tabId: matchingTab.id,
        positionInTab: 0,
      })

      // Navigate to terminals page with the tab
      navigate({ to: '/terminals', search: { tab: matchingTab.id } })
    }
  }, [tabs, createTerminal, navigate])

  const openInTerminal = useCallback(
    (directory: string, name: string) => {
      log.ws.info('useOpenInTerminal: openInTerminal called', {
        directory,
        name,
        connected,
        tabCount: tabs.length,
      })

      if (!connected) {
        log.ws.warn('useOpenInTerminal: not connected, aborting')
        return
      }

      // Check if tab with this directory already exists
      const existingTab = tabs.find((t) => t.directory === directory)

      log.ws.debug('useOpenInTerminal: existing tab check', {
        directory,
        existingTab: existingTab ? { id: existingTab.id, name: existingTab.name } : null,
      })

      if (existingTab) {
        // Navigate to existing tab
        log.ws.info('useOpenInTerminal: navigating to existing tab', { tabId: existingTab.id })
        navigate({ to: '/terminals', search: { tab: existingTab.id } })
        return
      }

      // Create new tab with directory - terminal will be created in useEffect when tab appears
      log.ws.info('useOpenInTerminal: creating new tab', { name, directory })
      pendingRef.current = { directory, name }
      createTab(name, undefined, directory)
    },
    [connected, tabs, createTab, navigate]
  )

  return { openInTerminal, connected }
}
