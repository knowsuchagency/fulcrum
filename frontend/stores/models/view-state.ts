import { types } from 'mobx-state-tree'
import type { Instance, SnapshotIn } from 'mobx-state-tree'

/**
 * Map of tab ID to focused terminal ID.
 * Tracks which terminal is focused in each tab.
 */
const FocusedTerminalsMap = types.map(types.string)

/**
 * ViewState model for UI state that needs to be persisted.
 *
 * This tracks view-related state like active tab, focused terminals,
 * and visibility state for notification suppression.
 */
export const ViewStateModel = types
  .model('ViewState', {
    /** Currently focused terminal for each tab (tabId -> terminalId) */
    focusedTerminals: types.optional(FocusedTerminalsMap, {}),
    /** Current view/route name for notification suppression */
    currentView: types.maybeNull(types.string),
    /** Current task ID being viewed (if on task detail page) */
    currentTaskId: types.maybeNull(types.string),
    /** Whether the browser tab is visible */
    isTabVisible: types.maybeNull(types.boolean),
    /** Timestamp of last view update */
    viewUpdatedAt: types.maybeNull(types.string),
  })
  .volatile(() => ({
    /** Pending updates waiting to be persisted */
    pendingUpdates: {} as Record<string, unknown>,
    /** Debounce timer for persistence */
    debounceTimer: null as ReturnType<typeof setTimeout> | null,
  }))
  .views((self) => ({
    /** Get the focused terminal ID for a specific tab */
    getFocusedTerminal(tabId: string): string | null {
      return self.focusedTerminals.get(tabId) ?? null
    },
  }))
  .actions((self) => ({
    /** Set the focused terminal for a tab */
    setFocusedTerminal(tabId: string, terminalId: string | null) {
      if (terminalId === null) {
        self.focusedTerminals.delete(tabId)
      } else {
        self.focusedTerminals.set(tabId, terminalId)
      }
    },

    /** Remove focused terminal entries for a deleted tab */
    clearFocusedTerminalForTab(tabId: string) {
      self.focusedTerminals.delete(tabId)
    },

    /** Update view tracking (for route changes) */
    updateViewTracking(currentView: string, currentTaskId: string | null) {
      self.currentView = currentView
      self.currentTaskId = currentTaskId
      self.viewUpdatedAt = new Date().toISOString()
    },

    /** Update tab visibility state */
    setTabVisible(isVisible: boolean) {
      self.isTabVisible = isVisible
      self.viewUpdatedAt = new Date().toISOString()
    },

    /** Hydrate from server data */
    hydrateFromServer(data: {
      focusedTerminals?: Record<string, string>
      currentView?: string | null
      currentTaskId?: string | null
      isTabVisible?: boolean | null
      viewUpdatedAt?: string | null
    }) {
      if (data.focusedTerminals) {
        self.focusedTerminals.clear()
        for (const [tabId, terminalId] of Object.entries(data.focusedTerminals)) {
          self.focusedTerminals.set(tabId, terminalId)
        }
      }
      if (data.currentView !== undefined) self.currentView = data.currentView
      if (data.currentTaskId !== undefined) self.currentTaskId = data.currentTaskId
      if (data.isTabVisible !== undefined) self.isTabVisible = data.isTabVisible
      if (data.viewUpdatedAt !== undefined) self.viewUpdatedAt = data.viewUpdatedAt
    },
  }))

export type IViewState = Instance<typeof ViewStateModel>
export type IViewStateSnapshot = SnapshotIn<typeof ViewStateModel>
