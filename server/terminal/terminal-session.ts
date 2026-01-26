import { spawn, type IPty } from 'bun-pty'
import { unlinkSync } from 'fs'
import { getDtachService } from './dtach-service'
import { BufferManager } from './buffer-manager'
import { db, terminals } from '../db'
import { eq } from 'drizzle-orm'
import { getShellEnv } from '../lib/env'
import type { TerminalInfo, TerminalStatus } from '../types'
import { log } from '../lib/logger'
import { getSettingByKey } from '../lib/settings'

export interface TerminalSessionOptions {
  id: string
  name: string
  cols: number
  rows: number
  cwd: string
  createdAt: number
  tabId?: string
  positionInTab?: number
  taskId?: string
  onData: (data: string) => void
  onExit: (exitCode: number, status: TerminalStatus) => void
  onShouldDestroy?: () => void
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
  private pty: IPty | null = null
  private buffer: BufferManager
  private onData: (data: string) => void
  private onExit: (exitCode: number, status: TerminalStatus) => void
  private onShouldDestroy?: () => void

  // Flag to indicate we're intentionally detaching (not exiting)
  // Prevents race condition where onExit marks terminal as exited during graceful detach
  private isDetaching = false

  // Tab association
  private _tabId?: string
  private _positionInTab: number
  private _taskId?: string

  // Input queue for data sent before PTY is attached
  private inputQueue: string[] = []

  constructor(options: TerminalSessionOptions) {
    this.id = options.id
    this._name = options.name
    this.cols = options.cols
    this.rows = options.rows
    this.cwd = options.cwd
    this.createdAt = options.createdAt
    this._tabId = options.tabId
    this._positionInTab = options.positionInTab ?? 0
    this._taskId = options.taskId
    this.buffer = new BufferManager()
    this.buffer.setTerminalId(this.id)
    this.onData = options.onData
    this.onExit = options.onExit
    this.onShouldDestroy = options.onShouldDestroy
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

  // Create a new dtach session (but don't attach yet - that happens in attach())
  start(): void {
    const dtach = getDtachService()
    const [cmd, ...args] = dtach.getCreateCommand(this.id)

    try {
      // Spawn dtach -n which creates the session and exits immediately
      // We don't track this as this.pty because it exits right away
      // The actual attachment happens in attach() which spawns dtach -a
      const creationPty = spawn(cmd, args, {
        name: 'xterm-256color',
        cols: this.cols,
        rows: this.rows,
        cwd: this.cwd,
        env: {
          ...getShellEnv(),
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          // Signal remote context for starship/shell prompts to show full info
          SSH_TTY: '/dev/pts/fulcrum',
          SSH_CONNECTION: '127.0.0.1 0 127.0.0.1 22',
          // Explicitly unset - bun-pty merges with process.env, doesn't replace
          NODE_ENV: '',
          PORT: '',
          // Inject Fulcrum URL so CLI tools (like the plugin) can find the server
          // This is critical when running on non-default ports (e.g. dev mode on 8888)
          // Use localhost to support both IPv4 and IPv6 (Bun defaults to IPv6 on macOS)
          FULCRUM_URL: `http://localhost:${getSettingByKey('port')}`,
          ...(this._taskId ? { FULCRUM_TASK_ID: this._taskId } : {}),
        },
      })

      // Don't set this.pty or call setupPtyHandlers() here
      // The dtach -n process exits immediately after creating the socket
      // The real PTY connection happens in attach()
      log.terminal.info('dtach session created', { terminalId: this.id })

      // Clean up the creation PTY when it exits (which should be immediately)
      creationPty.onExit(() => {
        log.terminal.debug('dtach -n process exited', { terminalId: this.id })
      })
    } catch (err) {
      log.terminal.error('Failed to start dtach session', { terminalId: this.id, error: String(err) })
      this.status = 'error'
      this.updateDb({ status: 'error' })
      this.onExit(1, 'error')
    }
  }

  // Attach to an existing dtach session (used after server restart)
  async attach(): Promise<void> {
    if (this.pty) {
      log.terminal.debug('Attach called but already attached', { terminalId: this.id })
      return // Already attached
    }

    const dtach = getDtachService()
    const socketPath = dtach.getSocketPath(this.id)

    log.terminal.info('Attach starting', {
      terminalId: this.id,
      name: this._name,
      cwd: this.cwd,
      socketPath,
    })

    // Wait for socket to appear (handles race condition on first dtach use)
    // dtach -n spawns and exits, but socket creation may take a few ms
    const MAX_ATTEMPTS = 10
    const POLL_INTERVAL_MS = 50
    let socketFound = false

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (dtach.hasSession(this.id)) {
        socketFound = true
        log.terminal.debug('Socket found', { terminalId: this.id, attempt })
        break
      }
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      }
    }

    if (!socketFound) {
      log.terminal.error('Attach failed: dtach socket not found after polling', {
        terminalId: this.id,
        socketPath,
        maxAttempts: MAX_ATTEMPTS,
      })
      this.status = 'exited'
      this.exitCode = 1
      this.updateDb({ status: 'exited', exitCode: 1 })
      this.onExit(1, 'exited')
      return
    }

    // Load saved buffer from disk before attaching
    this.buffer.loadFromDisk()

    const [cmd, ...args] = dtach.getAttachCommand(this.id)

    try {
      this.pty = spawn(cmd, args, {
        name: 'xterm-256color',
        cols: this.cols,
        rows: this.rows,
        cwd: this.cwd,
        env: {
          ...getShellEnv(),
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          // Explicitly unset - bun-pty merges with process.env, doesn't replace
          NODE_ENV: '',
          PORT: '',
        },
      })

      this.setupPtyHandlers()
      this.flushInputQueue()
      log.terminal.info('Attach succeeded', {
        terminalId: this.id,
        name: this._name,
        cwd: this.cwd,
      })
    } catch (err) {
      log.terminal.error('Attach failed: exception during spawn', {
        terminalId: this.id,
        error: String(err),
      })
      this.status = 'error'
      this.updateDb({ status: 'error' })
      this.onExit(1, 'error')
    }
  }

  private setupPtyHandlers(): void {
    if (!this.pty) return

    log.terminal.info('setupPtyHandlers: registering onData handler', { terminalId: this.id })

    this.pty.onData((data: string) => {
      log.terminal.info('pty.onData fired', { terminalId: this.id, dataLen: data.length })
      this.buffer.append(data)
      this.onData(data)
    })

    this.pty.onExit(({ exitCode }: { exitCode: number }) => {
      this.pty = null

      log.terminal.info('PTY onExit fired', {
        terminalId: this.id,
        exitCode,
        isDetaching: this.isDetaching,
      })

      // If we're intentionally detaching, don't mark as exited
      if (this.isDetaching) {
        log.terminal.debug('Ignoring onExit because isDetaching=true', { terminalId: this.id })
        return
      }

      const dtach = getDtachService()
      const socketExists = dtach.hasSession(this.id)

      log.terminal.debug('PTY onExit socket check', {
        terminalId: this.id,
        socketExists,
        exitCode,
      })

      if (!socketExists) {
        // Session actually ended (socket gone)
        log.terminal.info('onShouldDestroy triggered: socket gone', {
          terminalId: this.id,
          exitCode,
          reason: 'socket_not_found',
        })
        this.status = 'exited'
        this.exitCode = exitCode
        this.updateDb({ status: 'exited', exitCode })
        this.onExit(exitCode, 'exited')
        // Trigger destruction so terminal can be recreated
        this.onShouldDestroy?.()
      } else if (exitCode !== 0) {
        // Socket file exists but dtach failed to connect (stale socket - "Connection refused")
        // This happens when the underlying process died but socket file remains
        log.terminal.warn('onShouldDestroy triggered: stale socket', {
          terminalId: this.id,
          exitCode,
          reason: 'stale_socket',
        })
        this.status = 'error'
        this.exitCode = exitCode
        this.updateDb({ status: 'error', exitCode })
        this.onExit(exitCode, 'error')
        this.onShouldDestroy?.()
      } else {
        // dtach is still running with exit code 0, we just detached normally
        log.terminal.debug('PTY exited normally (detached), no destroy triggered', {
          terminalId: this.id,
          exitCode,
        })
      }
    })
  }

  private flushInputQueue(): void {
    if (this.pty && this.inputQueue.length > 0) {
      log.terminal.debug('flushing input queue', {
        terminalId: this.id,
        itemCount: this.inputQueue.length,
      })
      for (const data of this.inputQueue) {
        this.pty.write(data)
      }
      this.inputQueue = []
    }
  }

  detach(): void {
    log.terminal.info('Detaching terminal', {
      terminalId: this.id,
      name: this._name,
      hasPty: !!this.pty,
    })

    // Always save buffer to disk before detaching
    this.buffer.saveToDisk()

    if (this.pty) {
      // Set flag BEFORE killing to prevent onExit from marking as exited
      this.isDetaching = true
      this.pty.kill()
      this.pty = null
      // Reset flag after kill completes
      this.isDetaching = false
    }
  }

  write(data: string): void {
    if (this.pty && this.status === 'running') {
      this.pty.write(data)
    } else if (this.status === 'running') {
      // PTY not attached yet - queue input for later
      this.inputQueue.push(data)
      log.terminal.debug('queued input before attach', {
        terminalId: this.id,
        dataLen: data.length,
        queueSize: this.inputQueue.length,
      })
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

  clearBuffer(): void {
    this.buffer.clear()
    this.buffer.saveToDisk()
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
    log.terminal.info('Killing terminal', {
      terminalId: this.id,
      name: this._name,
      cwd: this.cwd,
      hasPty: !!this.pty,
    })

    // Kill the PTY connection (our attachment to dtach)
    if (this.pty) {
      this.pty.kill()
      this.pty = null
    }

    // Kill the dtach process and its entire process tree (shell + children like Claude)
    const dtach = getDtachService()
    dtach.killSession(this.id)

    // Clean up the socket file if it still exists
    const socketPath = dtach.getSocketPath(this.id)
    try {
      unlinkSync(socketPath)
      log.terminal.debug('Socket file removed', { terminalId: this.id, socketPath })
    } catch {
      // Socket might already be gone
      log.terminal.debug('Socket file already gone', { terminalId: this.id, socketPath })
    }

    // Delete saved buffer file
    this.buffer.deleteFromDisk()

    this.status = 'exited'
    log.terminal.info('Terminal killed', { terminalId: this.id })
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
