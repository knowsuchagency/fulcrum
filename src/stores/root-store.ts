import { types, getEnv, destroy, applyPatch, recordPatches } from 'mobx-state-tree'
import type { Instance, SnapshotIn, IJsonPatch } from 'mobx-state-tree'
import type { Terminal as XTerm } from '@xterm/xterm'
import { TerminalModel, TabModel, ViewStateModel } from './models'
import type { ITerminal, ITerminalSnapshot, ITab, ITabSnapshot } from './models'
import { log } from '@/lib/logger'
import { generateRequestId, generateTempId, type PendingUpdate } from './sync'

/**
 * Environment injected into the store.
 * Contains non-serializable dependencies like WebSocket.
 */
export interface StoreEnv {
  /** WebSocket send function */
  send: (message: object) => void
  /** Logger instance */
  log: typeof log
}

/**
 * Terminals collection with CRUD operations
 */
const TerminalsStore = types
  .model('TerminalsStore', {
    items: types.array(TerminalModel),
  })
  .views((self) => ({
    /** Get a terminal by ID */
    get(id: string): ITerminal | undefined {
      return self.items.find((t) => t.id === id)
    },

    /** Get all terminals for a specific tab */
    getByTab(tabId: string): ITerminal[] {
      return self.items
        .filter((t) => t.tabId === tabId)
        .sort((a, b) => a.positionInTab - b.positionInTab)
    },

    /** Get all task terminals (no tabId) */
    get taskTerminals(): ITerminal[] {
      return self.items.filter((t) => t.tabId == null)
    },

    /** Check if a terminal with given ID exists */
    has(id: string): boolean {
      return self.items.some((t) => t.id === id)
    },
  }))
  .actions((self) => ({
    /** Add a terminal from server data */
    add(data: ITerminalSnapshot) {
      // Prevent duplicates
      if (self.items.some((t) => t.id === data.id)) {
        log.ws.debug('Terminal already exists, skipping add', { id: data.id })
        return
      }
      self.items.push(data)
    },

    /** Remove a terminal by ID */
    remove(id: string) {
      const terminal = self.items.find((t) => t.id === id)
      if (terminal) {
        terminal.cleanup()
        destroy(terminal)
      }
    },

    /** Replace all terminals (for initial sync) */
    replaceAll(terminals: ITerminalSnapshot[]) {
      // Cleanup existing terminals
      for (const terminal of self.items) {
        terminal.cleanup()
      }
      self.items.clear()
      for (const t of terminals) {
        self.items.push(t)
      }
    },

    /** Clear all terminals */
    clear() {
      for (const terminal of self.items) {
        terminal.cleanup()
      }
      self.items.clear()
    },
  }))

/**
 * Tabs collection with CRUD operations
 */
const TabsStore = types
  .model('TabsStore', {
    items: types.array(TabModel),
  })
  .views((self) => ({
    /** Get a tab by ID */
    get(id: string): ITab | undefined {
      return self.items.find((t) => t.id === id)
    },

    /** Get all tabs sorted by position */
    get sorted(): ITab[] {
      return [...self.items].sort((a, b) => a.position - b.position)
    },

    /** Check if a tab with given ID exists */
    has(id: string): boolean {
      return self.items.some((t) => t.id === id)
    },

    /** Get the first tab (for default selection) */
    get first(): ITab | undefined {
      return this.sorted[0]
    },
  }))
  .actions((self) => ({
    /** Add a tab from server data */
    add(data: ITabSnapshot) {
      // Prevent duplicates
      if (self.items.some((t) => t.id === data.id)) {
        log.ws.debug('Tab already exists, skipping add', { id: data.id })
        return
      }
      self.items.push(data)
    },

    /** Remove a tab by ID */
    remove(id: string) {
      const tab = self.items.find((t) => t.id === id)
      if (tab) {
        destroy(tab)
      }
    },

    /** Replace all tabs (for initial sync) */
    replaceAll(tabs: ITabSnapshot[]) {
      self.items.clear()
      for (const t of tabs) {
        self.items.push(t)
      }
    },

    /** Clear all tabs */
    clear() {
      self.items.clear()
    },
  }))

/**
 * Root store composing all sub-stores.
 *
 * This is the main entry point for the MST store.
 * It manages terminals, tabs, and view state with WebSocket sync.
 */
export const RootStore = types
  .model('RootStore', {
    terminals: types.optional(TerminalsStore, { items: [] }),
    tabs: types.optional(TabsStore, { items: [] }),
    viewState: types.optional(ViewStateModel, {}),
  })
  .volatile(() => ({
    /** WebSocket connection state */
    connected: false,
    /** Whether initial sync has completed */
    initialized: false,
    /** Set of newly created terminal IDs (for auto-focus) */
    newTerminalIds: new Set<string>(),
    /** Pending optimistic updates awaiting server confirmation, keyed by requestId */
    pendingUpdates: new Map<string, PendingUpdate>(),
    /** Callbacks to invoke when terminal:attached is received */
    onAttachedCallbacks: new Map<string, () => void>(),
    /** Last focused terminal ID (for reconnection focus restoration) */
    lastFocusedTerminalId: null as string | null,
  }))
  .views((self) => ({
    /** Whether the store is ready for use */
    get isReady() {
      return self.connected && self.initialized
    },
  }))
  .actions((self) => {
    // Get environment (WebSocket send function)
    const getWs = () => getEnv<StoreEnv>(self)

    return {
      /** Mark as connected to WebSocket */
      setConnected(connected: boolean) {
        self.connected = connected
        if (!connected) {
          self.initialized = false
        }
      },

      /** Mark as initialized after initial sync */
      setInitialized(initialized: boolean) {
        self.initialized = initialized
      },

      /** Mark a terminal as newly created (for auto-focus) */
      markNewTerminal(id: string) {
        self.newTerminalIds.add(id)
      },

      /** Clear new terminal marker */
      clearNewTerminal(id: string) {
        self.newTerminalIds.delete(id)
      },

      // ============ Terminal Actions ============

      /**
       * Create a terminal with optimistic update.
       *
       * 1. Generate temp ID and requestId
       * 2. Create optimistic terminal locally (marked as pending)
       * 3. Record patches for potential rollback
       * 4. Send request to server
       * 5. On server confirm: replace temp ID with real ID
       * 6. On server reject: apply inverse patches to rollback
       */
      createTerminal(options: {
        name: string
        cols: number
        rows: number
        cwd?: string
        tabId?: string
        positionInTab?: number
      }) {
        const requestId = generateRequestId()
        const tempId = generateTempId()

        // Create optimistic terminal snapshot
        // For cwd, use provided value or placeholder - server will set the real cwd
        const optimisticTerminal: ITerminalSnapshot = {
          id: tempId,
          name: options.name,
          cwd: options.cwd ?? '~',
          status: 'running',
          cols: options.cols,
          rows: options.rows,
          createdAt: Date.now(),
          tabId: options.tabId ?? null,
          positionInTab: options.positionInTab ?? 0,
        }

        // Record patches while adding the terminal
        const recorder = recordPatches(self.terminals)
        self.terminals.add(optimisticTerminal)
        recorder.stop()

        // Mark terminal as pending
        const terminal = self.terminals.get(tempId)
        terminal?.setPending(true, tempId)

        // Store inverse patches for rollback
        self.pendingUpdates.set(requestId, {
          entityType: 'terminal',
          tempId,
          inversePatches: recorder.inversePatches as IJsonPatch[],
          createdAt: Date.now(),
        })

        // Add to newTerminalIds for auto-focus
        self.newTerminalIds.add(tempId)

        // Send request to server
        getWs().send({
          type: 'terminal:create',
          payload: {
            ...options,
            requestId,
            tempId,
          },
        })

        getWs().log.ws.debug('createTerminal optimistic', { requestId, tempId, name: options.name })
      },

      /** Request terminal destruction from server */
      destroyTerminal(terminalId: string, options?: { force?: boolean; reason?: string }) {
        getWs().send({
          type: 'terminal:destroy',
          payload: {
            terminalId,
            force: options?.force,
            reason: options?.reason,
          },
        })
        // Optimistic removal
        const terminal = self.terminals.get(terminalId)
        if (terminal) {
          terminal.cleanup()
        }
        self.terminals.remove(terminalId)
      },

      /** Send input to terminal */
      writeToTerminal(terminalId: string, data: string) {
        getWs().send({
          type: 'terminal:input',
          payload: { terminalId, data },
        })
      },

      /** Send text input followed by Enter key to terminal (for CLI tools like Claude Code) */
      sendInputToTerminal(terminalId: string, text: string) {
        // Write the text first
        getWs().send({
          type: 'terminal:input',
          payload: { terminalId, data: text },
        })
        // Then send Enter (\r) after a brief delay to ensure text is processed first
        setTimeout(() => {
          getWs().send({
            type: 'terminal:input',
            payload: { terminalId, data: '\r' },
          })
        }, 50)
      },

      /** Request terminal resize */
      resizeTerminal(terminalId: string, cols: number, rows: number) {
        getWs().send({
          type: 'terminal:resize',
          payload: { terminalId, cols, rows },
        })
        // Optimistic update
        const terminal = self.terminals.get(terminalId)
        terminal?.resize(cols, rows)
      },

      /** Request terminal rename */
      renameTerminal(terminalId: string, name: string) {
        getWs().send({
          type: 'terminal:rename',
          payload: { terminalId, name },
        })
        // Optimistic update
        const terminal = self.terminals.get(terminalId)
        terminal?.rename(name)
      },

      /**
       * Attach an xterm.js instance to a terminal.
       * Sets up input handlers, registers callbacks, and requests buffer from server.
       * Returns a cleanup function to detach the terminal.
       */
      attachXterm(
        terminalId: string,
        xterm: XTerm,
        options?: { onAttached?: () => void }
      ): () => void {
        const terminal = self.terminals.get(terminalId)
        if (!terminal) {
          getWs().log.ws.warn('attachXterm: terminal not found', { terminalId })
          return () => {}
        }

        // Store xterm reference in terminal's volatile state
        terminal.setXterm(xterm)

        // Handle Shift+Enter to insert a newline for Claude Code multi-line input
        xterm.attachCustomKeyEventHandler((event: KeyboardEvent) => {
          if (event.type === 'keydown' && event.shiftKey && event.key === 'Enter') {
            event.preventDefault()
            event.stopPropagation()
            getWs().send({
              type: 'terminal:input',
              payload: { terminalId, data: '\n' },
            })
            return false // Prevent xterm from processing (would send regular CR)
          }
          return true // Allow all other keys to be processed normally
        })

        // Set up input handling
        const disposable = xterm.onData((data) => {
          getWs().send({
            type: 'terminal:input',
            payload: { terminalId, data },
          })
        })

        // Track focus for reconnection restoration
        const handleFocus = () => {
          self.lastFocusedTerminalId = terminalId
        }
        xterm.textarea?.addEventListener('focus', handleFocus)

        // Register onAttached callback if provided
        if (options?.onAttached) {
          self.onAttachedCallbacks.set(terminalId, options.onAttached)
        }

        // Create cleanup function
        const cleanup = () => {
          disposable.dispose()
          xterm.textarea?.removeEventListener('focus', handleFocus)
          terminal.setXterm(null)
        }
        terminal.setAttachCleanup(cleanup)

        // Request attachment to get buffer
        getWs().send({
          type: 'terminal:attach',
          payload: { terminalId },
        })

        return cleanup
      },

      /** Request terminal attachment (low-level, just sends message) */
      requestAttach(terminalId: string) {
        getWs().send({
          type: 'terminal:attach',
          payload: { terminalId },
        })
      },

      /** Request buffer clear */
      clearTerminalBuffer(terminalId: string) {
        getWs().send({
          type: 'terminal:clearBuffer',
          payload: { terminalId },
        })
      },

      /** Request tab assignment */
      assignTerminalToTab(terminalId: string, tabId: string | null, positionInTab?: number) {
        getWs().send({
          type: 'terminal:assignTab',
          payload: { terminalId, tabId, positionInTab },
        })
        // Optimistic update
        const terminal = self.terminals.get(terminalId)
        terminal?.assignToTab(tabId, positionInTab)
      },

      // ============ Tab Actions ============

      /**
       * Create a tab with optimistic update.
       *
       * 1. Generate temp ID and requestId
       * 2. Create optimistic tab locally (marked as pending)
       * 3. Record patches for potential rollback
       * 4. Send request to server
       * 5. On server confirm: replace temp ID with real ID
       * 6. On server reject: apply inverse patches to rollback
       */
      createTab(name: string, position?: number, directory?: string) {
        const requestId = generateRequestId()
        const tempId = generateTempId()

        // Calculate position if not provided (append to end)
        const effectivePosition = position ?? self.tabs.items.length

        // Create optimistic tab snapshot
        const optimisticTab: ITabSnapshot = {
          id: tempId,
          name,
          position: effectivePosition,
          directory: directory ?? null,
          createdAt: Date.now(),
        }

        // Record patches while adding the tab
        const recorder = recordPatches(self.tabs)
        self.tabs.add(optimisticTab)
        recorder.stop()

        // Mark tab as pending
        const tab = self.tabs.get(tempId)
        tab?.setPending(true)

        // Store inverse patches for rollback
        self.pendingUpdates.set(requestId, {
          entityType: 'tab',
          tempId,
          inversePatches: recorder.inversePatches as IJsonPatch[],
          createdAt: Date.now(),
        })

        // Send request to server
        getWs().send({
          type: 'tab:create',
          payload: { name, position, directory, requestId, tempId },
        })

        getWs().log.ws.debug('createTab optimistic', { requestId, tempId, name })
      },

      /** Request tab update */
      updateTab(tabId: string, updates: { name?: string; directory?: string | null }) {
        getWs().send({
          type: 'tab:update',
          payload: { tabId, ...updates },
        })
        // Optimistic update
        const tab = self.tabs.get(tabId)
        tab?.updateFromServer(updates)
      },

      /** Request tab deletion */
      deleteTab(tabId: string) {
        getWs().send({
          type: 'tab:delete',
          payload: { tabId },
        })
        // Optimistic removal - terminals will be removed by server cascade
        self.tabs.remove(tabId)
        self.viewState.clearFocusedTerminalForTab(tabId)
      },

      /** Request tab reorder */
      reorderTab(tabId: string, position: number) {
        getWs().send({
          type: 'tab:reorder',
          payload: { tabId, position },
        })
        // Optimistic update
        const tab = self.tabs.get(tabId)
        tab?.setPosition(position)
      },

      // ============ Sync Actions ============

      /** Handle incoming WebSocket message */
      handleMessage(message: { type: string; payload: unknown }) {
        const { type, payload } = message

        switch (type) {
          case 'terminals:list':
            self.terminals.replaceAll((payload as { terminals: ITerminalSnapshot[] }).terminals)
            break

          case 'terminal:created': {
            const { terminal, isNew, requestId, tempId } = payload as {
              terminal: ITerminalSnapshot
              isNew: boolean
              requestId?: string
              tempId?: string
            }

            // Check if this is a confirmation of an optimistic update
            if (requestId && tempId) {
              const pendingUpdate = self.pendingUpdates.get(requestId)

              if (pendingUpdate && pendingUpdate.tempId === tempId) {
                // This confirms our optimistic update
                self.pendingUpdates.delete(requestId)

                // Get the optimistic terminal
                const optimisticTerminal = self.terminals.get(tempId)

                if (optimisticTerminal) {
                  if (isNew) {
                    // Server created a new terminal - update our optimistic terminal with real data
                    // We need to remove the temp and add the real one since ID is an identifier
                    optimisticTerminal.cleanup()
                    self.terminals.remove(tempId)
                    self.terminals.add(terminal)

                    // Update newTerminalIds to use real ID
                    self.newTerminalIds.delete(tempId)
                    self.newTerminalIds.add(terminal.id)

                    getWs().log.ws.debug('terminal:created confirmed', {
                      requestId,
                      tempId,
                      realId: terminal.id,
                    })
                  } else {
                    // Server returned existing terminal - rollback our optimistic and use existing
                    optimisticTerminal.cleanup()
                    self.terminals.remove(tempId)
                    self.newTerminalIds.delete(tempId)

                    // Add the existing terminal if we don't have it
                    if (!self.terminals.has(terminal.id)) {
                      self.terminals.add(terminal)
                    }

                    getWs().log.ws.debug('terminal:created deduplicated', {
                      requestId,
                      tempId,
                      existingId: terminal.id,
                    })
                  }
                }
                break
              }
            }

            // Standard terminal creation (from another client or non-optimistic)
            self.terminals.add(terminal)
            if (isNew) {
              self.newTerminalIds.add(terminal.id)
            }
            break
          }

          case 'terminal:destroyed': {
            const { terminalId } = payload as { terminalId: string }
            self.terminals.remove(terminalId)
            self.newTerminalIds.delete(terminalId)
            break
          }

          case 'terminal:output': {
            const { terminalId, data } = payload as { terminalId: string; data: string }
            const terminal = self.terminals.get(terminalId)
            if (terminal?.xterm) {
              terminal.xterm.write(data)
            } else {
              getWs().log.ws.warn('terminal:output but no xterm', { terminalId })
            }
            break
          }

          case 'terminal:attached': {
            const { terminalId, buffer } = payload as { terminalId: string; buffer?: string }
            const terminal = self.terminals.get(terminalId)
            if (terminal?.xterm) {
              // Reset terminal to clean state before replaying buffer
              terminal.xterm.reset()
              if (buffer) {
                terminal.xterm.write(buffer)
              }
            }
            // Call onAttached callback if registered
            const callback = self.onAttachedCallbacks.get(terminalId)
            if (callback) {
              self.onAttachedCallbacks.delete(terminalId)
              callback()
            }
            break
          }

          case 'terminal:bufferCleared': {
            const { terminalId } = payload as { terminalId: string }
            const terminal = self.terminals.get(terminalId)
            if (terminal?.xterm) {
              terminal.xterm.reset()
            }
            break
          }

          case 'terminal:exit': {
            const { terminalId, exitCode } = payload as { terminalId: string; exitCode: number }
            self.terminals.get(terminalId)?.markExited(exitCode)
            break
          }

          case 'terminal:renamed': {
            const { terminalId, name } = payload as { terminalId: string; name: string }
            self.terminals.get(terminalId)?.rename(name)
            break
          }

          case 'terminal:tabAssigned': {
            const { terminalId, tabId, positionInTab } = payload as {
              terminalId: string
              tabId: string | null
              positionInTab: number
            }
            self.terminals.get(terminalId)?.assignToTab(tabId, positionInTab)
            break
          }

          case 'tabs:list':
            self.tabs.replaceAll((payload as { tabs: ITabSnapshot[] }).tabs)
            self.initialized = true
            break

          case 'tab:created': {
            const { tab, requestId, tempId } = payload as {
              tab: ITabSnapshot
              requestId?: string
              tempId?: string
            }

            // Check if this is a confirmation of an optimistic update
            if (requestId && tempId) {
              const pendingUpdate = self.pendingUpdates.get(requestId)

              if (pendingUpdate && pendingUpdate.tempId === tempId) {
                // This confirms our optimistic update
                self.pendingUpdates.delete(requestId)

                // Get the optimistic tab
                const optimisticTab = self.tabs.get(tempId)

                if (optimisticTab) {
                  // Server created the tab - update with real data
                  // We need to remove the temp and add the real one since ID is an identifier
                  self.tabs.remove(tempId)
                  self.tabs.add(tab)

                  getWs().log.ws.debug('tab:created confirmed', {
                    requestId,
                    tempId,
                    realId: tab.id,
                  })
                }
                break
              }
            }

            // Standard tab creation (from another client or non-optimistic)
            self.tabs.add(tab)
            break
          }

          case 'tab:updated': {
            const { tabId, name, directory } = payload as {
              tabId: string
              name?: string
              directory?: string | null
            }
            self.tabs.get(tabId)?.updateFromServer({ name, directory })
            break
          }

          case 'tab:deleted': {
            const { tabId } = payload as { tabId: string }
            self.tabs.remove(tabId)
            self.viewState.clearFocusedTerminalForTab(tabId)
            break
          }

          case 'tab:reordered': {
            const { tabId, position } = payload as { tabId: string; position: number }
            self.tabs.get(tabId)?.setPosition(position)
            break
          }

          case 'terminal:error': {
            const { error, requestId, tempId } = payload as {
              terminalId?: string
              error: string
              requestId?: string
              tempId?: string
            }

            // Check if this is a rejection of an optimistic update
            if (requestId && tempId) {
              const pendingUpdate = self.pendingUpdates.get(requestId)

              if (pendingUpdate && pendingUpdate.tempId === tempId) {
                // Rollback the optimistic update
                self.pendingUpdates.delete(requestId)

                // Apply inverse patches to undo the optimistic terminal creation
                for (let i = pendingUpdate.inversePatches.length - 1; i >= 0; i--) {
                  applyPatch(self.terminals, pendingUpdate.inversePatches[i])
                }

                // Clean up newTerminalIds
                self.newTerminalIds.delete(tempId)

                getWs().log.ws.warn('terminal:error rollback', {
                  requestId,
                  tempId,
                  error,
                })
                break
              }
            }

            log.ws.error('Terminal error from server', { error })
            break
          }

          default:
            // Unknown message type - ignore
            break
        }
      },

      /** Reset store state (for reconnection) */
      reset() {
        self.terminals.clear()
        self.tabs.clear()
        self.connected = false
        self.initialized = false
        self.newTerminalIds.clear()
        self.pendingUpdates.clear()
      },
    }
  })

export type IRootStore = Instance<typeof RootStore>
export type IRootStoreSnapshot = SnapshotIn<typeof RootStore>
