import { spawn, type Pty } from 'bun-pty'
import { unlinkSync } from 'fs'
import { getDtachService } from './dtach-service'
import { BufferManager } from './buffer-manager'
import { db, terminals } from '../db'
import { eq } from 'drizzle-orm'
import type { TerminalInfo, TerminalStatus } from '../types'

export interface TerminalSessionOptions {
  id: string
  name: string
  cols: number
  rows: number
  cwd: string
  createdAt: number
  tabId?: string
  positionInTab?: number
  onData: (data: string) => void
  onExit: (exitCode: number) => void
}

export class TerminalSession {
  readonly id: string
  private _name: string
  readonly cwd: string
  readonly createdAt: number

  private cols: number
  private rows: number
  private status: TerminalStatus = 'running'
  private exitCode?: number
  private pty: Pty | null = null
  private buffer: BufferManager
  private onData: (data: string) => void
  private onExit: (exitCode: number) => void

  // Tab association
  private _tabId?: string
  private _positionInTab: number

  constructor(options: TerminalSessionOptions) {
    this.id = options.id
    this._name = options.name
    this.cols = options.cols
    this.rows = options.rows
    this.cwd = options.cwd
    this.createdAt = options.createdAt
    this._tabId = options.tabId
    this._positionInTab = options.positionInTab ?? 0
    this.buffer = new BufferManager()
    this.buffer.setTerminalId(this.id)
    this.onData = options.onData
    this.onExit = options.onExit
  }

  get name(): string {
    return this._name
  }

  get tabId(): string | undefined {
    return this._tabId
  }

  get positionInTab(): number {
    return this._positionInTab
  }

  rename(newName: string): void {
    this._name = newName
    this.updateDb({ name: newName })
  }

  assignTab(tabId: string | null, positionInTab?: number): void {
    this._tabId = tabId ?? undefined
    if (positionInTab !== undefined) {
      this._positionInTab = positionInTab
    }
    this.updateDb({ tabId, positionInTab: this._positionInTab })
  }

  // Create a new dtach session and attach to it
  start(): void {
    const dtach = getDtachService()
    const [cmd, ...args] = dtach.getCreateCommand(this.id)

    // Exclude PORT from child env to avoid conflicts with dev servers
    const { PORT: _PORT, ...envWithoutPort } = process.env
    void _PORT // Intentionally unused

    try {
      // Spawn dtach which creates the session and runs the shell
      this.pty = spawn(cmd, args, {
        name: 'xterm-256color',
        cols: this.cols,
        rows: this.rows,
        cwd: this.cwd,
        env: {
          ...envWithoutPort,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        } as Record<string, string>,
      })

      this.setupPtyHandlers()
    } catch (err) {
      console.error(`[TerminalSession] Failed to start dtach session:`, err)
      this.status = 'error'
      this.updateDb({ status: 'error' })
      this.onExit(1)
    }
  }

  // Attach to an existing dtach session (used after server restart)
  attach(): void {
    if (this.pty) return // Already attached

    const dtach = getDtachService()

    // Verify socket still exists
    if (!dtach.hasSession(this.id)) {
      console.error(`[TerminalSession] dtach socket not found for ${this.id}`)
      this.status = 'exited'
      this.exitCode = 1
      this.updateDb({ status: 'exited', exitCode: 1 })
      this.onExit(1)
      return
    }

    // Load saved buffer from disk before attaching
    this.buffer.loadFromDisk()

    const [cmd, ...args] = dtach.getAttachCommand(this.id)

    // Exclude PORT from child env to avoid conflicts with dev servers
    const { PORT: _PORT, ...envWithoutPort } = process.env
    void _PORT // Intentionally unused

    try {
      this.pty = spawn(cmd, args, {
        name: 'xterm-256color',
        cols: this.cols,
        rows: this.rows,
        cwd: this.cwd,
        env: {
          ...envWithoutPort,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        } as Record<string, string>,
      })

      this.setupPtyHandlers()
    } catch (err) {
      console.error(`[TerminalSession] Failed to attach to dtach:`, err)
      this.status = 'error'
      this.updateDb({ status: 'error' })
      this.onExit(1)
    }
  }

  private setupPtyHandlers(): void {
    if (!this.pty) return

    this.pty.onData((data) => {
      this.buffer.append(data)
      this.onData(data)
    })

    this.pty.onExit(({ exitCode }) => {
      this.pty = null
      const dtach = getDtachService()

      if (!dtach.hasSession(this.id)) {
        // Session actually ended (socket gone)
        this.status = 'exited'
        this.exitCode = exitCode
        this.updateDb({ status: 'exited', exitCode })
        this.onExit(exitCode)
      }
      // Otherwise dtach is still running, we just detached
    })
  }

  detach(): void {
    // Always save buffer to disk before detaching
    this.buffer.saveToDisk()

    if (this.pty) {
      this.pty.kill()
      this.pty = null
    }
  }

  write(data: string): void {
    if (this.pty && this.status === 'running') {
      this.pty.write(data)
    }
  }

  resize(cols: number, rows: number): void {
    this.cols = cols
    this.rows = rows

    if (this.pty) {
      this.pty.resize(cols, rows)
    }

    this.updateDb({ cols, rows })
  }

  getBuffer(): string {
    return this.buffer.getContents()
  }

  getInfo(): TerminalInfo {
    return {
      id: this.id,
      name: this.name,
      cwd: this.cwd,
      status: this.status,
      exitCode: this.exitCode,
      cols: this.cols,
      rows: this.rows,
      createdAt: this.createdAt,
      tabId: this._tabId,
      positionInTab: this._positionInTab,
    }
  }

  kill(): void {
    // Kill the PTY connection
    if (this.pty) {
      this.pty.kill()
      this.pty = null
    }

    // The dtach socket will be cleaned up when the shell exits
    // Send SIGHUP to the session by removing the socket
    const dtach = getDtachService()
    const socketPath = dtach.getSocketPath(this.id)
    try {
      unlinkSync(socketPath)
    } catch {
      // Socket might already be gone
    }

    // Delete saved buffer file
    this.buffer.deleteFromDisk()

    this.status = 'exited'
  }

  isRunning(): boolean {
    return this.status === 'running'
  }

  isAttached(): boolean {
    return this.pty !== null
  }

  private updateDb(
    updates: Partial<{
      name: string
      cols: number
      rows: number
      status: string
      exitCode: number
      tabId: string | null
      positionInTab: number
    }>
  ): void {
    const now = new Date().toISOString()
    db.update(terminals)
      .set({ ...updates, updatedAt: now })
      .where(eq(terminals.id, this.id))
      .run()
  }
}
