import { useState, useCallback, useEffect } from 'react'
import { Outlet, createRootRoute, useRouterState } from '@tanstack/react-router'
import { Header } from '@/components/layout/header'
import { useTaskSync } from '@/hooks/use-task-sync'
import { useLanguageSync } from '@/hooks/use-language-sync'
import { useThemeSync } from '@/hooks/use-theme-sync'
import { useTerminalViewState } from '@/hooks/use-terminal-view-state'
import { KeyboardProvider } from '@/contexts/keyboard-context'
import { CommandPalette } from '@/components/command-palette/command-palette'
import { PageBackground } from '@/components/layout/page-background'
import { ConnectionStatusBanner } from '@/components/layout/connection-status-banner'
import { AgentSetupBanner } from '@/components/onboarding/agent-setup-banner'
import { KeyboardShortcutsHelp } from '@/components/keyboard-shortcuts-help'
import { OpenInEditorDialog } from '@/components/open-in-editor-dialog'
import { Toaster } from '@/components/ui/sonner'

export const Route = createRootRoute({
  component: RootLayout,
})

function TaskSync() {
  useTaskSync()
  return null
}

function LanguageSync() {
  useLanguageSync()
  return null
}

function ThemeSync() {
  useThemeSync()
  return null
}

// Track current view for notification suppression
function ViewTracking() {
  const location = useRouterState({ select: (s) => s.location })
  const { updateViewTracking } = useTerminalViewState()

  useEffect(() => {
    const path = location.pathname
    let currentView = 'other'
    let currentTaskId: string | null = null
    let activeTabId: string | null = null

    if (path.startsWith('/tasks/')) {
      currentView = 'task-detail'
      currentTaskId = path.split('/')[2] || null
    } else if (path === '/terminals') {
      currentView = 'terminals'
      // Extract the active terminal tab from URL search params
      const params = new URLSearchParams(location.search)
      activeTabId = params.get('tab')
    }

    updateViewTracking(currentView, currentTaskId, activeTabId)
  }, [location.pathname, location.search, updateViewTracking])

  return null
}

// Post route changes to parent window (for desktop app)
function DesktopBridge() {
  const location = useRouterState({ select: (s) => s.location })

  useEffect(() => {
    // Only post if we're in an iframe (desktop app)
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: 'vibora:route', pathname: location.pathname, search: location.search },
        '*'
      )
    }
  }, [location.pathname, location.search])

  return null
}

function RootLayout() {
  const [openNewTask, setOpenNewTask] = useState<(() => void) | null>(null)
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [openInEditorDialogOpen, setOpenInEditorDialogOpen] = useState(false)
  const isDesktop = typeof window !== 'undefined' && window.parent !== window

  const handleNewTaskRef = useCallback((fn: () => void) => {
    setOpenNewTask(() => fn)
  }, [])

  const handleNewTask = useCallback(() => {
    openNewTask?.()
  }, [openNewTask])

  const handleShowShortcuts = useCallback(() => {
    setShortcutsHelpOpen(true)
  }, [])

  const handleOpenCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true)
  }, [])

  const handleOpenInEditor = useCallback(() => {
    setOpenInEditorDialogOpen(true)
  }, [])

  return (
    <KeyboardProvider>
      <div className="flex h-screen flex-col overflow-x-hidden bg-background text-foreground">
        <TaskSync />
        <LanguageSync />
        <ThemeSync />
        <ViewTracking />
        <DesktopBridge />
        <ConnectionStatusBanner />
        <AgentSetupBanner />
        <Header onNewTaskRef={handleNewTaskRef} onOpenCommandPalette={handleOpenCommandPalette} />
        <main className="isolate flex-1 overflow-hidden relative">
          <PageBackground />
          <Outlet />
        </main>
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          onNewTask={handleNewTask}
          onShowShortcuts={handleShowShortcuts}
          onOpenInEditor={handleOpenInEditor}
        />
        <KeyboardShortcutsHelp open={shortcutsHelpOpen} onOpenChange={setShortcutsHelpOpen} />
        <OpenInEditorDialog open={openInEditorDialogOpen} onOpenChange={setOpenInEditorDialogOpen} />
        <Toaster position={isDesktop ? 'bottom-center' : 'bottom-right'} />
      </div>
    </KeyboardProvider>
  )
}
