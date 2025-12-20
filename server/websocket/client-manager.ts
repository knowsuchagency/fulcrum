import type { ServerWebSocket } from 'bun'
import type { ServerMessage } from '../types'

export interface ClientData {
  id: string
  attachedTerminals: Set<string>
}

export class ClientManager {
  private clients = new Map<ServerWebSocket<ClientData>, ClientData>()

  add(ws: ServerWebSocket<ClientData>): void {
    const data: ClientData = {
      id: crypto.randomUUID(),
      attachedTerminals: new Set(),
    }
    ws.data = data
    this.clients.set(ws, data)
  }

  remove(ws: ServerWebSocket<ClientData>): void {
    this.clients.delete(ws)
  }

  attachToTerminal(ws: ServerWebSocket<ClientData>, terminalId: string): void {
    const data = this.clients.get(ws)
    if (data) {
      data.attachedTerminals.add(terminalId)
    }
  }

  detachFromTerminal(ws: ServerWebSocket<ClientData>, terminalId: string): void {
    const data = this.clients.get(ws)
    if (data) {
      data.attachedTerminals.delete(terminalId)
    }
  }

  broadcast(message: ServerMessage): void {
    const json = JSON.stringify(message)
    for (const ws of this.clients.keys()) {
      ws.send(json)
    }
  }

  broadcastToTerminal(terminalId: string, message: ServerMessage): void {
    const json = JSON.stringify(message)
    for (const [ws, data] of this.clients.entries()) {
      if (data.attachedTerminals.has(terminalId)) {
        ws.send(json)
      }
    }
  }

  sendTo(ws: ServerWebSocket<ClientData>, message: ServerMessage): void {
    ws.send(JSON.stringify(message))
  }

  getClientCount(): number {
    return this.clients.size
  }
}
