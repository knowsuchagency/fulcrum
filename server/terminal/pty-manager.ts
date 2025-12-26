import { TerminalSession } from './terminal-session'
import { getDtachService, DtachService } from './dtach-service'
import { db, terminals } from '../db'
import { eq, ne } from 'drizzle-orm'
import * as os from 'os'
import type { TerminalInfo } from '../types'
import { log } from '../lib/logger'
import { getViboraDir } from '../lib/settings'

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

  // Called on server startup to restore terminals from DB
  async restoreFromDatabase(): Promise<void> {
    // Check if dtach is available
    if (!DtachService.isAvailable()) {
      log.pty.error('dtach is not installed, terminal persistence disabled')
      return
    }

    const dtach = getDtachService()
    const storedTerminals = db
      .select()
      .from(terminals)
      .where(ne(terminals.status, 'exited'))
      .all()

    const MAX_RETRIES = 3
    const RETRY_DELAY_MS = 100

    for (const record of storedTerminals) {
      // Retry socket check a few times with small delays to handle timing issues
      let socketFound = false
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (dtach.hasSession(record.id)) {
          socketFound = true
          break
        }
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
        }
      }

      if (socketFound) {
        // Session exists - create TerminalSession object (but don't attach yet)
        const session = new TerminalSession({
          id: record.id,
          name: record.name,
          cols: record.cols,
          rows: record.rows,
          cwd: record.cwd,
          createdAt: new Date(record.createdAt).getTime(),
          tabId: record.tabId ?? undefined,
          positionInTab: record.positionInTab ?? 0,
          onData: (data) => this.callbacks.onData(record.id, data),
          onExit: (exitCode) => this.callbacks.onExit(record.id, exitCode),
        })
        this.sessions.set(record.id, session)
        log.pty.info('Restored terminal', { terminalId: record.id, name: record.name })
      } else {
        // Session is gone after retries - mark as exited
        db.update(terminals)
          .set({ status: 'exited', updatedAt: new Date().toISOString() })
          .where(eq(terminals.id, record.id))
          .run()
        log.pty.warn('Terminal dtach socket not found after retries, marked as exited', {
          terminalId: record.id,
          name: record.name,
          socketPath: dtach.getSocketPath(record.id),
          viboraDir: getViboraDir(),
        })
      }
    }

    log.pty.info('Restored terminals', { count: this.sessions.size })
  }

  create(options: {
    name: string
    cols: number
    rows: number
    cwd?: string
    tabId?: string
    positionInTab?: number
  }): TerminalInfo {
    // Check if dtach is available
    if (!DtachService.isAvailable()) {
      throw new Error('dtach is not installed')
    }

    const id = crypto.randomUUID()
    const cwd = options.cwd || os.homedir()

    // Persist to database first
    const now = new Date().toISOString()
    db.insert(terminals)
      .values({
        id,
        name: options.name,
        cwd,
        cols: options.cols,
        rows: options.rows,
        tmuxSession: '', // Not used with dtach but required by schema
        status: 'running',
        tabId: options.tabId,
        positionInTab: options.positionInTab ?? 0,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    // Create session object
    const session = new TerminalSession({
      id,
      name: options.name,
      cols: options.cols,
      rows: options.rows,
      cwd,
      createdAt: Date.now(),
      tabId: options.tabId,
      positionInTab: options.positionInTab,
      onData: (data) => this.callbacks.onData(id, data),
      onExit: (exitCode) => this.callbacks.onExit(id, exitCode),
    })

    this.sessions.set(id, session)

    // Start the dtach session (creates and attaches)
    session.start()

    return session.getInfo()
  }

  // Called when client attaches - ensures PTY is connected
  attach(terminalId: string): boolean {
    const session = this.sessions.get(terminalId)
    if (!session) return false
    if (!session.isAttached()) {
      session.attach()
    }
    return true
  }

  destroy(terminalId: string): boolean {
    const session = this.sessions.get(terminalId)
    if (!session) {
      return false
    }

    session.kill()
    this.sessions.delete(terminalId)

    // Remove from database
    db.delete(terminals).where(eq(terminals.id, terminalId)).run()

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

  assignTab(terminalId: string, tabId: string | null, positionInTab?: number): boolean {
    const session = this.sessions.get(terminalId)
    if (!session) {
      return false
    }

    session.assignTab(tabId, positionInTab)
    return true
  }

  getBuffer(terminalId: string): string | null {
    const session = this.sessions.get(terminalId)
    if (!session) {
      return null
    }

    return session.getBuffer()
  }

  clearBuffer(terminalId: string): boolean {
    const session = this.sessions.get(terminalId)
    if (!session) {
      return false
    }

    session.clearBuffer()
    return true
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

  // Kill Claude processes in a specific terminal (but keep terminal running)
  killClaudeInTerminal(terminalId: string): boolean {
    const session = this.sessions.get(terminalId)
    if (!session) {
      return false
    }

    const dtach = getDtachService()
    return dtach.killClaudeInSession(terminalId)
  }

  // Detach all PTYs but keep dtach sessions running
  detachAll(): void {
    for (const session of this.sessions.values()) {
      session.detach()
    }
  }

  // Kill all terminals and their dtach sessions
  destroyAll(): void {
    for (const session of this.sessions.values()) {
      session.kill()
      db.delete(terminals).where(eq(terminals.id, session.id)).run()
    }
    this.sessions.clear()
  }
}
