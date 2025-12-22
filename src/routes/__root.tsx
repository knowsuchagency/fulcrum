import { useState, useCallback } from 'react'
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { Header } from '@/components/layout/header'
import { useTaskSync } from '@/hooks/use-task-sync'
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
      <div className="flex h-screen flex-col bg-background text-foreground">
        <TaskSync />
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
