import type { ITheme } from '@xterm/xterm'

/**
 * Convert a CSS color value to hex format for xterm
 * Reads computed style which converts oklch/etc to rgb
 */
function cssColorToHex(cssValue: string): string {
  // Create a temporary element to compute the color
  const temp = document.createElement('div')
  temp.style.color = cssValue
  document.body.appendChild(temp)
  const computed = getComputedStyle(temp).color
  document.body.removeChild(temp)

  // Parse rgb(r, g, b) or rgba(r, g, b, a)
  const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) return cssValue

  const r = parseInt(match[1]).toString(16).padStart(2, '0')
  const g = parseInt(match[2]).toString(16).padStart(2, '0')
  const b = parseInt(match[3]).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

/**
 * Get the current value of a CSS variable as hex
 */
function getCssVarHex(varName: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  if (!value) return '#000000'
  // If it's already a color value (not a var reference), convert it
  return cssColorToHex(value)
}

/**
 * Build terminal theme from CSS variables
 * This keeps terminal colors in sync with the app theme
 */
export function getTerminalTheme(isDark: boolean): ITheme {
  // Read theme colors from CSS variables
  const background = getCssVarHex('--terminal-background')
  const foreground = getCssVarHex('--foreground')
  const card = getCssVarHex('--card')
  const muted = getCssVarHex('--muted-foreground')
  const accent = getCssVarHex('--accent')
  const destructive = getCssVarHex('--destructive')

  if (isDark) {
    return {
      background,
      foreground,
      cursor: foreground,
      cursorAccent: background,
      selectionBackground: card,
      black: '#18181b',
      red: destructive,
      green: '#22c55e',
      yellow: '#eab308',
      blue: accent,
      magenta: '#a855f7',
      cyan: '#06b6d4',
      white: foreground,
      brightBlack: muted,
      brightRed: '#f87171',
      brightGreen: '#4ade80',
      brightYellow: '#facc15',
      brightBlue: '#60a5fa',
      brightMagenta: '#c084fc',
      brightCyan: '#22d3ee',
      brightWhite: '#fafafa',
    }
  }

  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: '#d1d5db',
    black: foreground,
    red: destructive,
    green: accent,
    yellow: destructive,
    blue: accent,
    magenta: muted,
    cyan: accent,
    white: muted,
    brightBlack: muted,
    brightRed: destructive,
    brightGreen: accent,
    brightYellow: destructive,
    brightBlue: accent,
    brightMagenta: muted,
    brightCyan: accent,
    brightWhite: muted,
  }
}

// Legacy exports for compatibility - these are now generated dynamically
export const lightTheme: ITheme = {
  background: '#f8f8f8',
  foreground: '#000000',
  cursor: '#000000',
  cursorAccent: '#f8f8f8',
  selectionBackground: '#d1d5db',
  black: '#000000',
  red: '#dd403a',
  green: '#0d5c63',
  yellow: '#dd403a',
  blue: '#0d5c63',
  magenta: '#5c5c59',
  cyan: '#0d5c63',
  white: '#5c5c59',
  brightBlack: '#5c5c59',
  brightRed: '#dd403a',
  brightGreen: '#0d5c63',
  brightYellow: '#dd403a',
  brightBlue: '#0d5c63',
  brightMagenta: '#5c5c59',
  brightCyan: '#0d5c63',
  brightWhite: '#5c5c59',
}

export const darkTheme: ITheme = {
  background: '#232323',
  foreground: '#e4e4e7',
  cursor: '#e4e4e7',
  cursorAccent: '#232323',
  selectionBackground: '#3f3f46',
  black: '#18181b',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#e4e4e7',
  brightBlack: '#52525b',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#fafafa',
}
