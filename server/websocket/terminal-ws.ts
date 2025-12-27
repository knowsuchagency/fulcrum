import type { WSContext, WSEvents } from 'hono/ws'
import type { ClientMessage, ServerMessage } from '../types'
import { getPTYManager } from '../terminal/pty-instance'
import { getTabManager } from '../terminal/tab-manager'
import { log } from '../lib/logger'

interface ClientData {
  id: string
  attachedTerminals: Set<string>
}

// Store client data keyed by WSContext
const clients = new Map<WSContext, ClientData>()

export function broadcast(message: ServerMessage): void {
  const json = JSON.stringify(message)
  for (const ws of clients.keys()) {
    try {
      ws.send(json)
    } catch {
      // Client might be disconnected
    }
  }
}

export function broadcastToTerminal(terminalId: string, message: ServerMessage): void {
  const json = JSON.stringify(message)
  let sentCount = 0
  const attachedClients: string[] = []

  for (const [ws, data] of clients.entries()) {
    if (data.attachedTerminals.has(terminalId)) {
      attachedClients.push(data.id)
      try {
        ws.send(json)
        sentCount++
      } catch {
        // Client might be disconnected
      }
    }
  }

  // Log for terminal:output messages to trace the broadcast
  if (message.type === 'terminal:output') {
    log.ws.info('broadcastToTerminal', {
      terminalId,
      totalClients: clients.size,
      attachedClients: attachedClients.length,
      sentCount,
      dataLen: (message.payload as { data?: string }).data?.length ?? 0,
    })
  }
}

function sendTo(ws: WSContext, message: ServerMessage): void {
  try {
    ws.send(JSON.stringify(message))
  } catch {
    // Client might be disconnected
  }
}

export const terminalWebSocketHandlers: WSEvents = {
  onOpen(evt, ws) {
    const clientData: ClientData = {
      id: crypto.randomUUID(),
      attachedTerminals: new Set(),
    }
    clients.set(ws, clientData)
    log.ws.info('Client connected', { totalClients: clients.size })

    // Send list of existing terminals and tabs
    const ptyManager = getPTYManager()
    const tabManager = getTabManager()

    // Ensure at least one tab exists
    tabManager.ensureDefaultTab()

    const terminalsList = ptyManager.listTerminals()
    log.ws.debug('Sending terminals:list to new client', {
      clientId: clientData.id,
      terminalCount: terminalsList.length,
      terminals: terminalsList.map((t) => ({ id: t.id, name: t.name, cwd: t.cwd, tabId: t.tabId })),
    })
    sendTo(ws, {
      type: 'terminals:list',
      payload: { terminals: terminalsList },
    })
    sendTo(ws, {
      type: 'tabs:list',
      payload: { tabs: tabManager.list() },
    })
  },

  onMessage(evt, ws) {
    const clientData = clients.get(ws)
    if (!clientData) return

    try {
      const message: ClientMessage = JSON.parse(
        typeof evt.data === 'string' ? evt.data : new TextDecoder().decode(evt.data as ArrayBuffer)
      )
      const ptyManager = getPTYManager()
      const tabManager = getTabManager()

      switch (message.type) {
        // Terminal messages
        case 'terminal:create': {
          const { name, cols, rows, cwd, tabId, positionInTab, requestId, tempId } = message.payload

          // If tabId provided but no cwd, use the tab's directory as default
          let effectiveCwd = cwd
          if (tabId && !cwd) {
            const tab = tabManager.get(tabId)
            if (tab?.directory) {
              effectiveCwd = tab.directory
            }
          }

          log.ws.debug('terminal:create request', { name, cwd: effectiveCwd, tabId, clientId: clientData.id, requestId, tempId })

          // Prevent duplicate terminals for same cwd - but only for task terminals (no tabId)
          // Regular tabs can have multiple terminals in the same directory
          if (effectiveCwd && !tabId) {
            const existing = ptyManager.listTerminals().find((t) => t.cwd === effectiveCwd && !t.tabId)
            if (existing) {
              // Return existing terminal instead of creating duplicate
              log.ws.debug('terminal:create returning existing', { terminalId: existing.id, isNew: false, requestId, tempId })
              clientData.attachedTerminals.add(existing.id)
              sendTo(ws, {
                type: 'terminal:created',
                payload: { terminal: existing, isNew: false, requestId, tempId },
              })
              break
            }
          }

          const terminal = ptyManager.create({ name, cols, rows, cwd: effectiveCwd, tabId, positionInTab })
          log.ws.info('terminal:create created new', {
            terminalId: terminal.id,
            name,
            cwd,
            clientId: clientData.id,
            requestId,
            tempId,
          })
          clientData.attachedTerminals.add(terminal.id)
          log.ws.info('terminal:create added to attachedTerminals', {
            terminalId: terminal.id,
            clientId: clientData.id,
            totalAttached: clientData.attachedTerminals.size,
          })
          broadcast({
            type: 'terminal:created',
            payload: { terminal, isNew: true, requestId, tempId },
          })
          break
        }

        case 'terminal:destroy': {
          const { terminalId, force, reason } = message.payload
          const terminalInfo = ptyManager.getInfo(terminalId)

          // Protection: Tab terminals require explicit force flag
          if (terminalInfo?.tabId && !force) {
            log.ws.warn('terminal:destroy BLOCKED - tab terminal requires force flag', {
              terminalId,
              tabId: terminalInfo.tabId,
              name: terminalInfo.name,
              clientId: clientData.id,
              reason,
            })
            sendTo(ws, {
              type: 'terminal:error',
              payload: {
                terminalId,
                error: 'Tab terminals require explicit force flag to destroy',
              },
            })
            break
          }

          // Audit log: Record all deletions with full context
          log.ws.info('terminal:destroy EXECUTING', {
            terminalId,
            name: terminalInfo?.name,
            cwd: terminalInfo?.cwd,
            tabId: terminalInfo?.tabId,
            clientId: clientData.id,
            reason: reason ?? 'unspecified',
            force: force ?? false,
          })

          const destroyed = ptyManager.destroy(terminalId)
          if (destroyed) {
            broadcast({
              type: 'terminal:destroyed',
              payload: { terminalId },
            })
          }
          break
        }

        case 'terminal:input': {
          log.ws.debug('terminal:input', { terminalId: message.payload.terminalId, dataLen: message.payload.data.length })
          ptyManager.write(message.payload.terminalId, message.payload.data)
          break
        }

        case 'terminal:resize': {
          ptyManager.resize(message.payload.terminalId, message.payload.cols, message.payload.rows)
          break
        }

        case 'terminal:attach': {
          const terminalId = message.payload.terminalId
          // Ensure terminal is attached to dtach (connects PTY if not already)
          ptyManager.attach(terminalId)
          const buffer = ptyManager.getBuffer(terminalId)
          log.ws.info('terminal:attach adding to attachedTerminals', {
            terminalId,
            bufferLength: buffer?.length ?? null,
            clientId: clientData.id,
            priorAttached: Array.from(clientData.attachedTerminals),
          })
          if (buffer !== null) {
            clientData.attachedTerminals.add(terminalId)
            log.ws.debug('terminal:attach sending terminal:attached', {
              terminalId,
              bufferLength: buffer.length,
              clientId: clientData.id,
            })
            sendTo(ws, {
              type: 'terminal:attached',
              payload: {
                terminalId,
                buffer,
              },
            })
          } else {
            log.ws.warn('terminal:attach buffer is null, not sending terminal:attached', {
              terminalId,
              clientId: clientData.id,
            })
          }
          break
        }

        case 'terminals:list': {
          sendTo(ws, {
            type: 'terminals:list',
            payload: { terminals: ptyManager.listTerminals() },
          })
          break
        }

        case 'terminal:rename': {
          const { terminalId, name } = message.payload
          const success = ptyManager.rename(terminalId, name)
          if (success) {
            broadcast({
              type: 'terminal:renamed',
              payload: { terminalId, name },
            })
          } else {
            // Terminal doesn't exist - send sync:stale
            log.ws.warn('terminal:rename failed - terminal not found', { terminalId, clientId: clientData.id })
            sendTo(ws, {
              type: 'sync:stale',
              payload: {
                entityType: 'terminal',
                entityId: terminalId,
                error: `Terminal ${terminalId} not found`,
              },
            })
          }
          break
        }

        case 'terminal:assignTab': {
          const { terminalId, tabId, positionInTab } = message.payload
          const success = ptyManager.assignTab(terminalId, tabId, positionInTab)
          if (success) {
            const info = ptyManager.getInfo(terminalId)
            broadcast({
              type: 'terminal:tabAssigned',
              payload: {
                terminalId,
                tabId,
                positionInTab: info?.positionInTab ?? 0,
              },
            })
          } else {
            // Terminal or tab doesn't exist
            log.ws.warn('terminal:assignTab failed', { terminalId, tabId, clientId: clientData.id })
            sendTo(ws, {
              type: 'sync:stale',
              payload: {
                entityType: 'terminal',
                entityId: terminalId,
                error: `Terminal ${terminalId} or tab ${tabId} not found`,
              },
            })
          }
          break
        }

        case 'terminal:clearBuffer': {
          const { terminalId } = message.payload
          const success = ptyManager.clearBuffer(terminalId)
          if (success) {
            broadcastToTerminal(terminalId, {
              type: 'terminal:bufferCleared',
              payload: { terminalId },
            })
          }
          break
        }

        // Tab messages
        case 'tab:create': {
          const { name, position, directory, requestId, tempId } = message.payload
          log.ws.debug('tab:create request', { name, position, directory, clientId: clientData.id, requestId, tempId })
          const tab = tabManager.create({ name, position, directory })
          log.ws.info('tab:create created', { tabId: tab.id, name: tab.name, directory: tab.directory, requestId, tempId })
          broadcast({
            type: 'tab:created',
            payload: { tab, requestId, tempId },
          })
          break
        }

        case 'tab:update': {
          const { tabId, name, directory } = message.payload
          const success = tabManager.update(tabId, { name, directory })
          if (success) {
            broadcast({
              type: 'tab:updated',
              payload: { tabId, name, directory },
            })
          } else {
            // Tab doesn't exist
            log.ws.warn('tab:update failed - tab not found', { tabId, clientId: clientData.id })
            sendTo(ws, {
              type: 'sync:stale',
              payload: {
                entityType: 'tab',
                entityId: tabId,
                error: `Tab ${tabId} not found`,
              },
            })
          }
          break
        }

        case 'tab:delete': {
          const { tabId } = message.payload
          const tabInfo = tabManager.get(tabId)

          log.ws.info('tab:delete received', {
            tabId,
            tabName: tabInfo?.name,
            clientId: clientData.id,
          })

          // Cascade: Destroy all terminals in this tab first
          const terminalsInTab = ptyManager.listTerminals().filter((t) => t.tabId === tabId)

          for (const terminal of terminalsInTab) {
            log.ws.info('tab:delete CASCADE destroying terminal', {
              terminalId: terminal.id,
              terminalName: terminal.name,
              tabId,
              clientId: clientData.id,
            })

            const destroyed = ptyManager.destroy(terminal.id)
            if (destroyed) {
              broadcast({
                type: 'terminal:destroyed',
                payload: { terminalId: terminal.id },
              })
            }
          }

          // Now delete the tab
          const success = tabManager.delete(tabId)
          if (success) {
            log.ws.info('tab:delete SUCCESS', {
              tabId,
              tabName: tabInfo?.name,
              terminalsDestroyed: terminalsInTab.length,
              clientId: clientData.id,
            })
            broadcast({
              type: 'tab:deleted',
              payload: { tabId },
            })
          }
          break
        }

        case 'tab:reorder': {
          const { tabId, position } = message.payload
          const success = tabManager.reorder(tabId, position)
          if (success) {
            broadcast({
              type: 'tab:reordered',
              payload: { tabId, position },
            })
          } else {
            // Tab doesn't exist
            log.ws.warn('tab:reorder failed - tab not found', { tabId, position, clientId: clientData.id })
            sendTo(ws, {
              type: 'sync:stale',
              payload: {
                entityType: 'tab',
                entityId: tabId,
                error: `Tab ${tabId} not found`,
              },
            })
          }
          break
        }

        case 'tabs:list': {
          sendTo(ws, {
            type: 'tabs:list',
            payload: { tabs: tabManager.list() },
          })
          break
        }
      }
    } catch (error) {
      log.ws.error('Failed to handle message', { error: String(error) })
    }
  },

  onClose(evt, ws) {
    clients.delete(ws)
    log.ws.info('Client disconnected', { remainingClients: clients.size })
  },

  onError(evt, ws) {
    log.ws.error('WebSocket error', { error: String(evt) })
    clients.delete(ws)
  },
}
