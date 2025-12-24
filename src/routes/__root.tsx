import { useState, useCallback, useEffect } from 'react'
import { Outlet, createRootRoute, useRouterState } from '@tanstack/react-router'
import { Header } from '@/components/layout/header'
import { useTaskSync } from '@/hooks/use-task-sync'
import { useLanguageSync } from '@/hooks/use-language-sync'
import { useTerminalViewState } from '@/hooks/use-terminal-view-state'
import { KeyboardProvider } from '@/contexts/keyboard-context'
import { CommandPalette } from '@/components/command-palette/command-palette'
import { KeyboardShortcutsHelp } from '@/components/keyboard-shortcuts-help'
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

// Track current view for notification suppression
function ViewTracking() {
  const location = useRouterState({ select: (s) => s.location })
  const { updateViewTracking } = useTerminalViewState()

  useEffect(() => {
    const path = location.pathname
    let currentView = 'other'
    let currentTaskId: string | null = null

    if (path.startsWith('/tasks/')) {
      currentView = 'task-detail'
      currentTaskId = path.split('/')[2] || null
    } else if (path === '/terminals') {
      currentView = 'terminals'
    }

    updateViewTracking(currentView, currentTaskId)
  }, [location.pathname, updateViewTracking])

  return null
}

function RootLayout() {
  const [openNewTask, setOpenNewTask] = useState<(() => void) | null>(null)
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

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

  return (
    <KeyboardProvider>
      <div className="flex h-screen flex-col overflow-x-hidden bg-background text-foreground">
        <TaskSync />
        <LanguageSync />
        <ViewTracking />
        <Header onNewTaskRef={handleNewTaskRef} onOpenCommandPalette={handleOpenCommandPalette} />
        <main className="isolate flex-1 overflow-hidden">
          <Outlet />
        </main>
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          onNewTask={handleNewTask}
          onShowShortcuts={handleShowShortcuts}
        />
        <KeyboardShortcutsHelp open={shortcutsHelpOpen} onOpenChange={setShortcutsHelpOpen} />
        <Toaster position="bottom-right" />
      </div>
    </KeyboardProvider>
  )
}
