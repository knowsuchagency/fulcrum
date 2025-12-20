import { TerminalSession } from './terminal-session'
import type { TerminalInfo } from '../types'

export interface PTYManagerCallbacks {
  onData: (terminalId: string, data: string) => void
  onExit: (terminalId: string, exitCode: number) => void
}

export class PTYManager {
  private sessions = new Map<string, TerminalSession>()
  private callbacks: PTYManagerCallbacks

  constructor(callbacks: PTYManagerCallbacks) {
    this.callbacks = callbacks
  }

  create(options: {
    name: string
    cols: number
    rows: number
    cwd?: string
  }): TerminalInfo {
    const id = crypto.randomUUID()

    const session = new TerminalSession({
      id,
      name: options.name,
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      onData: (data) => this.callbacks.onData(id, data),
      onExit: (exitCode) => this.callbacks.onExit(id, exitCode),
    })

    session.start()
    this.sessions.set(id, session)

    return session.getInfo()
  }

  destroy(terminalId: string): boolean {
    const session = this.sessions.get(terminalId)
    if (!session) {
      return false
    }

    session.kill()
    this.sessions.delete(terminalId)
    return true
  }

  write(terminalId: string, data: string): boolean {
    const session = this.sessions.get(terminalId)
    if (!session) {
      return false
    }

    session.write(data)
    return true
  }

  resize(terminalId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(terminalId)
    if (!session) {
      return false
    }

    session.resize(cols, rows)
    return true
  }

  rename(terminalId: string, name: string): boolean {
    const session = this.sessions.get(terminalId)
    if (!session) {
      return false
    }

    session.rename(name)
    return true
  }

  getBuffer(terminalId: string): string | null {
    const session = this.sessions.get(terminalId)
    if (!session) {
      return null
    }

    return session.getBuffer()
  }

  getInfo(terminalId: string): TerminalInfo | null {
    const session = this.sessions.get(terminalId)
    if (!session) {
      return null
    }

    return session.getInfo()
  }

  listTerminals(): TerminalInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.getInfo())
  }

  destroyAll(): void {
    for (const session of this.sessions.values()) {
      session.kill()
    }
    this.sessions.clear()
  }
}
