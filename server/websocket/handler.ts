import type { ServerWebSocket } from 'bun'
import type { ClientMessage } from '../types'
import type { PTYManager } from '../terminal/pty-manager'
import type { ClientManager, ClientData } from './client-manager'

export class WebSocketHandler {
  private ptyManager: PTYManager
  private clientManager: ClientManager

  constructor(ptyManager: PTYManager, clientManager: ClientManager) {
    this.ptyManager = ptyManager
    this.clientManager = clientManager
  }

  handleMessage(ws: ServerWebSocket<ClientData>, rawMessage: string | Buffer): void {
    try {
      const message: ClientMessage = JSON.parse(
        typeof rawMessage === 'string' ? rawMessage : new TextDecoder().decode(rawMessage)
      )

      switch (message.type) {
        case 'terminal:create':
          this.handleCreate(ws, message.payload)
          break

        case 'terminal:destroy':
          this.handleDestroy(ws, message.payload)
          break

        case 'terminal:input':
          this.handleInput(message.payload)
          break

        case 'terminal:resize':
          this.handleResize(message.payload)
          break

        case 'terminal:attach':
          this.handleAttach(ws, message.payload)
          break

        case 'terminals:list':
          this.handleList(ws)
          break

        default:
          console.warn('Unknown message type:', (message as any).type)
      }
    } catch (error) {
      console.error('Failed to handle message:', error)
      this.clientManager.sendTo(ws, {
        type: 'terminal:error',
        payload: {
          error: 'Invalid message format',
        },
      })
    }
  }

  private handleCreate(
    ws: ServerWebSocket<ClientData>,
    payload: { name: string; cols: number; rows: number; cwd?: string }
  ): void {
    const terminal = this.ptyManager.create({
      name: payload.name,
      cols: payload.cols,
      rows: payload.rows,
      cwd: payload.cwd,
    })

    // Auto-attach the creator to the terminal
    this.clientManager.attachToTerminal(ws, terminal.id)

    // Notify all clients about the new terminal
    this.clientManager.broadcast({
      type: 'terminal:created',
      payload: { terminal },
    })
  }

  private handleDestroy(
    ws: ServerWebSocket<ClientData>,
    payload: { terminalId: string }
  ): void {
    const success = this.ptyManager.destroy(payload.terminalId)
    if (!success) {
      this.clientManager.sendTo(ws, {
        type: 'terminal:error',
        payload: {
          terminalId: payload.terminalId,
          error: 'Terminal not found',
        },
      })
    }
    // Exit message will be broadcast by PTY manager callback
  }

  private handleInput(payload: { terminalId: string; data: string }): void {
    this.ptyManager.write(payload.terminalId, payload.data)
  }

  private handleResize(payload: { terminalId: string; cols: number; rows: number }): void {
    this.ptyManager.resize(payload.terminalId, payload.cols, payload.rows)
  }

  private handleAttach(
    ws: ServerWebSocket<ClientData>,
    payload: { terminalId: string }
  ): void {
    const buffer = this.ptyManager.getBuffer(payload.terminalId)
    if (buffer === null) {
      this.clientManager.sendTo(ws, {
        type: 'terminal:error',
        payload: {
          terminalId: payload.terminalId,
          error: 'Terminal not found',
        },
      })
      return
    }

    this.clientManager.attachToTerminal(ws, payload.terminalId)
    this.clientManager.sendTo(ws, {
      type: 'terminal:attached',
      payload: {
        terminalId: payload.terminalId,
        buffer,
      },
    })
  }

  private handleList(ws: ServerWebSocket<ClientData>): void {
    const terminals = this.ptyManager.listTerminals()
    this.clientManager.sendTo(ws, {
      type: 'terminals:list',
      payload: { terminals },
    })
  }
}
