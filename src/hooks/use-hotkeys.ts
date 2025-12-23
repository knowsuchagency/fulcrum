import { useEffect, useCallback, useRef } from 'react'
import { matchesShortcut, isInputElement } from '@/lib/keyboard'
import { useKeyboardContext } from '@/contexts/keyboard-context'

export interface HotkeyOptions {
  /**
   * Bypass the shortcutsEnabled check (e.g., for Escape in modals)
   */
  ignoreContext?: boolean

  /**
   * Allow the shortcut to fire even when an input element is focused
   * Useful for navigation shortcuts like Cmd+1, Cmd+2
   */
  allowInInput?: boolean

  /**
   * Allow the shortcut to fire even when a terminal is focused
   * Useful for navigation shortcuts that should work globally
   */
  allowInTerminal?: boolean

  /**
   * Dependencies array for the callback (like useCallback deps)
   */
  deps?: unknown[]

  /**
   * Whether the shortcut is currently enabled
   */
  enabled?: boolean
}

/**
 * Register a keyboard shortcut handler
 *
 * @param shortcut - Shortcut string(s) like "meta+k" or ["meta+n", "ctrl+n"]
 * @param callback - Handler to call when shortcut is triggered
 * @param options - Configuration options
 *
 * @example
 * // Simple shortcut
 * useHotkeys('meta+k', () => setOpen(true))
 *
 * // With options
 * useHotkeys('escape', () => setOpen(false), { ignoreContext: true })
 *
 * // Multiple shortcuts
 * useHotkeys(['meta+n', 'ctrl+n'], () => createNew())
 */
export function useHotkeys(
  shortcut: string | string[],
  callback: (event: KeyboardEvent) => void,
  options: HotkeyOptions = {}
): void {
  const { shortcutsEnabled } = useKeyboardContext()
  const { ignoreContext = false, allowInInput = false, allowInTerminal = false, deps = [], enabled = true } = options

  // Use ref to always have latest callback without re-adding listeners
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  const shortcuts = Array.isArray(shortcut) ? shortcut : [shortcut]

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Check if shortcuts are enabled (unless ignoring context or allowed in terminal)
      if (!ignoreContext && !shortcutsEnabled && !allowInTerminal) return

      // Check if enabled
      if (!enabled) return

      // Check if we're in an input element
      if (!allowInInput && isInputElement(event.target)) {
        // Always allow Escape even in inputs
        const isEscape = shortcuts.some((s) => s.toLowerCase() === 'escape')
        if (!isEscape) return
      }

      // Check if any shortcut matches
      const matched = shortcuts.some((s) => matchesShortcut(event, s))
      if (!matched) return

      // Prevent default browser behavior
      event.preventDefault()
      event.stopPropagation()

      // Call the handler
      callbackRef.current(event)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shortcutsEnabled, ignoreContext, allowInInput, allowInTerminal, enabled, ...shortcuts, ...deps]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])
}
