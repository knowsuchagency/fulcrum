import type { ITheme } from '@xterm/xterm'

export const lightTheme: ITheme = {
  background: '#faf9f5',           // Porcelain
  foreground: '#2a2a27',           // Graphite
  cursor: '#2a2a27',               // Graphite
  cursorAccent: '#faf9f5',         // Porcelain
  selectionBackground: '#d1d5db',
  black: '#2a2a27',                // Graphite
  red: '#dd403a',                  // Cinnabar
  green: '#0d5c63',                // Stormy Teal
  yellow: '#dd403a',               // Cinnabar (warm accent)
  blue: '#0d5c63',                 // Stormy Teal
  magenta: '#5c5c59',              // Darkened Lavender Grey for contrast
  cyan: '#0d5c63',                 // Stormy Teal
  white: '#5c5c59',                // Darkened grey (visible on light bg)
  brightBlack: '#5c5c59',          // Darkened Lavender Grey for contrast
  brightRed: '#dd403a',            // Cinnabar
  brightGreen: '#0d5c63',          // Stormy Teal
  brightYellow: '#dd403a',         // Cinnabar (warm accent)
  brightBlue: '#0d5c63',           // Stormy Teal
  brightMagenta: '#5c5c59',        // Darkened Lavender Grey for contrast
  brightCyan: '#0d5c63',           // Stormy Teal
  brightWhite: '#5c5c59',          // Darkened grey (visible on light bg)
}

export const darkTheme: ITheme = {
  background: '#0a0a0a',
  foreground: '#e4e4e7',
  cursor: '#e4e4e7',
  cursorAccent: '#0a0a0a',
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
