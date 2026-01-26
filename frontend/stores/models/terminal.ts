import { types } from 'mobx-state-tree'
import type { Instance, SnapshotIn } from 'mobx-state-tree'
import type { AnyTerminal } from '@/components/terminal/terminal-types'

/**
 * Terminal status enum matching server types
 */
export const TerminalStatus = types.enumeration('TerminalStatus', ['running', 'exited', 'error'])

/**
 * Terminal model representing a persistent terminal session.
 *
 * The model stores serializable state that syncs with the server,
 * while volatile state (xterm instance, cleanup functions) is kept
 * separately and doesn't persist across reconnections.
 */
export const TerminalModel = types
  .model('Terminal', {
    id: types.identifier,
    name: types.string,
    cwd: types.string,
    status: TerminalStatus,
    exitCode: types.maybe(types.number),
    cols: types.number,
    rows: types.number,
    createdAt: types.number,
    tabId: types.maybeNull(types.string),
    positionInTab: types.optional(types.number, 0),
  })
  .volatile(() => ({
    /** The xterm.js terminal instance */
    xterm: null as AnyTerminal | null,
    /** Cleanup function for xterm attachment */
    attachCleanup: null as (() => void) | null,
    /** Whether this terminal is pending creation confirmation from server */
    isPending: false,
    /** Temporary client-side ID before server confirms (for optimistic updates) */
    pendingId: null as string | null,
    /** Whether Claude Code is currently starting up in this terminal */
    isStartingUp: false,
    /**
     * VibeTunnel scroll management: whether to auto-scroll on new output.
     * Disabled when user scrolls up, re-enabled when user scrolls to bottom.
     */
    followCursorEnabled: true,
    /**
     * Tracks cursor visibility from escape sequences.
     * TUI apps like Claude Code hide the native cursor (ESC[?25l) and render their own.
     * When cursor is hidden, we skip auto-scrollToBottom to avoid interfering with
     * the TUI's viewport management (fixes cursor position issues in xterm 6.0.0+).
     */
    cursorVisible: true,
  }))
  .views((self) => ({
    /** Whether the terminal is alive (running) */
    get isAlive() {
      return self.status === 'running'
    },
    /** Whether the terminal belongs to a tab (vs being a task terminal) */
    get isTabTerminal() {
      return self.tabId != null
    },
  }))
  .actions((self) => ({
    /** Update terminal properties from server message */
    updateFromServer(data: Partial<SnapshotIn<typeof TerminalModel>>) {
      if (data.name !== undefined) self.name = data.name
      if (data.cwd !== undefined) self.cwd = data.cwd
      if (data.status !== undefined) self.status = data.status
      if (data.exitCode !== undefined) self.exitCode = data.exitCode
      if (data.cols !== undefined) self.cols = data.cols
      if (data.rows !== undefined) self.rows = data.rows
      if (data.tabId !== undefined) self.tabId = data.tabId
      if (data.positionInTab !== undefined) self.positionInTab = data.positionInTab
    },

    /** Set the xterm.js terminal instance */
    setXterm(xterm: AnyTerminal | null) {
      self.xterm = xterm
    },

    /** Set follow cursor state for VibeTunnel scroll management */
    setFollowCursorEnabled(enabled: boolean) {
      self.followCursorEnabled = enabled
    },

    /** Set cursor visibility state (tracked from terminal escape sequences) */
    setCursorVisible(visible: boolean) {
      self.cursorVisible = visible
    },

    /** Set the cleanup function for xterm attachment */
    setAttachCleanup(cleanup: (() => void) | null) {
      self.attachCleanup = cleanup
    },

    /** Mark as exited or error with exit code and status */
    markExited(exitCode: number, status: 'exited' | 'error' = 'exited') {
      self.status = status
      self.exitCode = exitCode
    },

    /** Update tab assignment */
    assignToTab(tabId: string | null, positionInTab?: number) {
      self.tabId = tabId
      if (positionInTab !== undefined) {
        self.positionInTab = positionInTab
      }
    },

    /** Rename the terminal */
    rename(name: string) {
      self.name = name
    },

    /** Resize the terminal */
    resize(cols: number, rows: number) {
      self.cols = cols
      self.rows = rows
    },

    /** Set pending state for optimistic updates */
    setPending(isPending: boolean, pendingId?: string | null) {
      self.isPending = isPending
      if (pendingId !== undefined) {
        self.pendingId = pendingId
      }
    },

    /** Set Claude startup state */
    setStartingUp(isStartingUp: boolean) {
      self.isStartingUp = isStartingUp
    },

    /** Cleanup volatile state */
    cleanup() {
      if (self.attachCleanup) {
        self.attachCleanup()
        self.attachCleanup = null
      }
      self.xterm = null
    },
  }))

export type ITerminal = Instance<typeof TerminalModel>
export type ITerminalSnapshot = SnapshotIn<typeof TerminalModel>
