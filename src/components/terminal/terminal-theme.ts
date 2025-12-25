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
  background: '#2a2a27',           // Graphite
  foreground: '#faf9f5',           // Porcelain
  cursor: '#faf9f5',               // Porcelain
  cursorAccent: '#2a2a27',         // Graphite
  selectionBackground: '#3d3d3a',
  black: '#2a2a27',                // Graphite
  red: '#dd403a',                  // Cinnabar
  green: '#0d5c63',                // Stormy Teal
  yellow: '#dd403a',               // Cinnabar (warm accent)
  blue: '#0d5c63',                 // Stormy Teal
  magenta: '#8d909b',              // Lavender Grey
  cyan: '#0d5c63',                 // Stormy Teal
  white: '#faf9f5',                // Porcelain
  brightBlack: '#8d909b',          // Lavender Grey
  brightRed: '#dd403a',            // Cinnabar
  brightGreen: '#0d5c63',          // Stormy Teal
  brightYellow: '#dd403a',         // Cinnabar (warm accent)
  brightBlue: '#0d5c63',           // Stormy Teal
  brightMagenta: '#8d909b',        // Lavender Grey
  brightCyan: '#0d5c63',           // Stormy Teal
  brightWhite: '#faf9f5',          // Porcelain
}
