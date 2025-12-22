/**
 * Keyboard shortcut utilities
 */

export function isMac(): boolean {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0
}

export interface ParsedShortcut {
  meta: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
  key: string
}

/**
 * Parse a shortcut string into its components
 * Format: "meta+k", "shift+meta+/", "escape", "ctrl+shift+n"
 */
export function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.toLowerCase().split('+')
  const key = parts.pop() || ''

  return {
    meta: parts.includes('meta') || parts.includes('cmd'),
    ctrl: parts.includes('ctrl'),
    alt: parts.includes('alt') || parts.includes('option'),
    shift: parts.includes('shift'),
    key,
  }
}

/**
 * Check if a keyboard event matches a shortcut string
 */
export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut)

  // Check modifiers
  if (parsed.meta !== event.metaKey) return false
  if (parsed.ctrl !== event.ctrlKey) return false
  if (parsed.alt !== event.altKey) return false
  if (parsed.shift !== event.shiftKey) return false

  // Check key (case-insensitive)
  const eventKey = event.key.toLowerCase()
  const targetKey = parsed.key.toLowerCase()

  // Handle special keys
  if (targetKey === 'escape') return eventKey === 'escape'
  if (targetKey === 'enter') return eventKey === 'enter'
  if (targetKey === 'space') return eventKey === ' '
  if (targetKey === 'backspace') return eventKey === 'backspace'
  if (targetKey === 'delete') return eventKey === 'delete'
  if (targetKey === 'tab') return eventKey === 'tab'
  if (targetKey === 'arrowup') return eventKey === 'arrowup'
  if (targetKey === 'arrowdown') return eventKey === 'arrowdown'
  if (targetKey === 'arrowleft') return eventKey === 'arrowleft'
  if (targetKey === 'arrowright') return eventKey === 'arrowright'

  // Handle number keys (both main keyboard and numpad)
  if (/^[0-9]$/.test(targetKey)) {
    return eventKey === targetKey
  }

  // Handle ? which is shift+/
  if (targetKey === '?') {
    return eventKey === '?'
  }

  // Handle comma
  if (targetKey === ',') {
    return eventKey === ','
  }

  return eventKey === targetKey
}

/**
 * Format a shortcut string for display
 * "meta+k" -> "Cmd+K" (Mac) or "Ctrl+K" (Windows/Linux)
 */
export function formatShortcut(shortcut: string): string {
  const parsed = parseShortcut(shortcut)
  const parts: string[] = []
  const mac = isMac()

  if (parsed.ctrl) parts.push(mac ? 'Ctrl' : 'Ctrl')
  if (parsed.alt) parts.push(mac ? 'Option' : 'Alt')
  if (parsed.shift) parts.push('Shift')
  if (parsed.meta) parts.push(mac ? 'Cmd' : 'Ctrl')

  // Format the key
  let key = parsed.key.toUpperCase()
  if (key === 'ESCAPE') key = 'Esc'
  if (key === 'ENTER') key = 'Enter'
  if (key === 'SPACE') key = 'Space'
  if (key === 'BACKSPACE') key = 'Backspace'
  if (key === 'DELETE') key = 'Delete'
  if (key === 'ARROWUP') key = '\u2191'
  if (key === 'ARROWDOWN') key = '\u2193'
  if (key === 'ARROWLEFT') key = '\u2190'
  if (key === 'ARROWRIGHT') key = '\u2192'
  if (key === ',') key = ','
  if (key === '?') key = '?'

  parts.push(key)

  return parts.join('+')
}

/**
 * Check if the event target is an input element where shortcuts should be disabled
 */
export function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false

  const tagName = target.tagName.toLowerCase()
  if (tagName === 'input' || tagName === 'textarea') return true
  if (target.isContentEditable) return true

  return false
}
