import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'

interface KeyboardContextValue {
  // Terminal focus tracking - when true, most shortcuts are disabled
  terminalFocused: boolean
  setTerminalFocused: (focused: boolean) => void

  // Modal state tracking - when true, some shortcuts are disabled
  modalOpen: boolean
  setModalOpen: (open: boolean) => void

  // Derived: should global shortcuts fire?
  // Shortcuts are enabled when terminal is not focused
  shortcutsEnabled: boolean
}

const KeyboardContext = createContext<KeyboardContextValue | null>(null)

export function KeyboardProvider({ children }: { children: ReactNode }) {
  const [terminalFocused, setTerminalFocusedState] = useState(false)
  const [modalOpen, setModalOpenState] = useState(false)

  const setTerminalFocused = useCallback((focused: boolean) => {
    setTerminalFocusedState(focused)
  }, [])

  const setModalOpen = useCallback((open: boolean) => {
    setModalOpenState(open)
  }, [])

  const shortcutsEnabled = useMemo(() => {
    // Shortcuts are disabled when terminal is focused
    // Modal open doesn't disable all shortcuts (e.g., Escape should still work)
    return !terminalFocused
  }, [terminalFocused])

  const value = useMemo<KeyboardContextValue>(
    () => ({
      terminalFocused,
      setTerminalFocused,
      modalOpen,
      setModalOpen,
      shortcutsEnabled,
    }),
    [terminalFocused, setTerminalFocused, modalOpen, setModalOpen, shortcutsEnabled]
  )

  return <KeyboardContext.Provider value={value}>{children}</KeyboardContext.Provider>
}

export function useKeyboardContext(): KeyboardContextValue {
  const context = useContext(KeyboardContext)
  if (!context) {
    throw new Error('useKeyboardContext must be used within a KeyboardProvider')
  }
  return context
}
