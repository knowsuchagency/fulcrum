import type { WSContext, WSEvents } from 'hono/ws'
import type { ClientMessage, ServerMessage } from '../types'
import { getPTYManager } from '../terminal/pty-instance'

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
  for (const [ws, data] of clients.entries()) {
    if (data.attachedTerminals.has(terminalId)) {
      try {
        ws.send(json)
      } catch {
        // Client might be disconnected
      }
    }
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
    console.log(`Client connected (${clients.size} total)`)

    // Send list of existing terminals
    const ptyManager = getPTYManager()
    const terminals = ptyManager.listTerminals()
    sendTo(ws, {
      type: 'terminals:list',
      payload: { terminals },
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

      switch (message.type) {
        case 'terminal:create': {
          const { name, cols, rows, cwd } = message.payload

          // Prevent duplicate terminals for same cwd
          if (cwd) {
            const existing = ptyManager.listTerminals().find((t) => t.cwd === cwd)
            if (existing) {
              // Return existing terminal instead of creating duplicate
              clientData.attachedTerminals.add(existing.id)
              sendTo(ws, {
                type: 'terminal:created',
                payload: { terminal: existing },
              })
              break
            }
          }

          const terminal = ptyManager.create({ name, cols, rows, cwd })
          clientData.attachedTerminals.add(terminal.id)
          broadcast({
            type: 'terminal:created',
            payload: { terminal },
          })
          break
        }

        case 'terminal:destroy': {
          ptyManager.destroy(message.payload.terminalId)
          break
        }

        case 'terminal:input': {
          ptyManager.write(message.payload.terminalId, message.payload.data)
          break
        }

        case 'terminal:resize': {
          ptyManager.resize(message.payload.terminalId, message.payload.cols, message.payload.rows)
          break
        }

        case 'terminal:attach': {
          const buffer = ptyManager.getBuffer(message.payload.terminalId)
          if (buffer !== null) {
            clientData.attachedTerminals.add(message.payload.terminalId)
            sendTo(ws, {
              type: 'terminal:attached',
              payload: {
                terminalId: message.payload.terminalId,
                buffer,
              },
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
          const success = ptyManager.rename(message.payload.terminalId, message.payload.name)
          if (success) {
            broadcast({
              type: 'terminal:renamed',
              payload: {
                terminalId: message.payload.terminalId,
                name: message.payload.name,
              },
            })
          }
          break
        }
      }
    } catch (error) {
      console.error('Failed to handle message:', error)
    }
  },

  onClose(evt, ws) {
    clients.delete(ws)
    console.log(`Client disconnected (${clients.size} remaining)`)
  },

  onError(evt, ws) {
    console.error('WebSocket error:', evt)
    clients.delete(ws)
  },
}
