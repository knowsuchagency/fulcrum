import type { Terminal as XTerm } from '@xterm/xterm'
import type { Terminal as GhosttyTerminal } from 'ghostty-web'

/**
 * Feature flag to switch between xterm.js and Ghostty terminal.
 *
 * Set to true to use Ghostty with VibeTunnel's scroll management pattern.
 * Set to false to use the original xterm.js implementation.
 */
export const USE_GHOSTTY_TERMINAL = true

/**
 * Union type for terminal instances that can be either xterm.js or Ghostty.
 * Both have compatible APIs for the methods we use.
 */
export type AnyTerminal = XTerm | GhosttyTerminal

/**
 * Check if a terminal is a Ghostty terminal by checking for getViewportY method.
 * xterm.js doesn't have this method, Ghostty does.
 */
export function isGhosttyTerminal(terminal: AnyTerminal): terminal is GhosttyTerminal {
  return typeof (terminal as GhosttyTerminal).getViewportY === 'function'
}

/**
 * Scroll management state for VibeTunnel's pattern.
 * Tracks whether auto-scroll should be enabled based on user scroll behavior.
 */
export interface ScrollManagementState {
  /**
   * Whether to auto-scroll to bottom on new output.
   * Disabled when user scrolls up, re-enabled when user scrolls to bottom.
   */
  followCursorEnabled: boolean
}

/**
 * Default scroll management state.
 */
export function createScrollManagementState(): ScrollManagementState {
  return {
    followCursorEnabled: true,
  }
}
