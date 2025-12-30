import { spawn, type Pty } from 'bun-pty'
import { unlinkSync } from 'fs'
import { getDtachService } from './dtach-service'
import { BufferManager } from './buffer-manager'
import { db, terminals } from '../db'
import { eq } from 'drizzle-orm'
import { getZAiSettings } from '../lib/settings'
import type { TerminalInfo, TerminalStatus } from '../types'
import { log } from '../lib/logger'

// z.ai related env vars to filter when z.ai is disabled
const ZAI_ENV_VARS = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'API_TIMEOUT_MS',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
]

// Get clean environment for terminal, filtering z.ai vars if disabled
function getTerminalEnv(): Record<string, string> {
  const { PORT: _PORT, NODE_ENV: _NODE_ENV, ...envWithoutFiltered } = process.env
  void _PORT
  void _NODE_ENV

  const zaiSettings = getZAiSettings()
  if (zaiSettings.enabled) {
    return envWithoutFiltered as Record<string, string>
  }

  // Filter out z.ai env vars when disabled
  const filtered: Record<string, string> = {}
  for (const [key, value] of Object.entries(envWithoutFiltered)) {
    if (!ZAI_ENV_VARS.includes(key) && value !== undefined) {
      filtered[key] = value
    }
  }
  return filtered
}

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
  private pty: Pty | null = null
  private buffer: BufferManager
  private onData: (data: string) => void
  private onExit: (exitCode: number) => void
  private onShouldDestroy?: () => void

  // Flag to indicate we're intentionally detaching (not exiting)
  // Prevents race condition where onExit marks terminal as exited during graceful detach
  private isDetaching = false

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
          ...getTerminalEnv(),
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          // Signal remote context for starship/shell prompts to show full info
          SSH_TTY: '/dev/pts/vibora',
          SSH_CONNECTION: '127.0.0.1 0 127.0.0.1 22',
          // Explicitly unset - bun-pty merges with process.env, doesn't replace
          NODE_ENV: '',
          PORT: '',
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
      this.onExit(1)
    }
  }

  // Attach to an existing dtach session (used after server restart)
  async attach(): Promise<void> {
    if (this.pty) return // Already attached

    const dtach = getDtachService()

    // Wait for socket to appear (handles race condition on first dtach use)
    // dtach -n spawns and exits, but socket creation may take a few ms
    const MAX_ATTEMPTS = 10
    const POLL_INTERVAL_MS = 50
    let socketFound = false

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (dtach.hasSession(this.id)) {
        socketFound = true
        break
      }
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      }
    }

    if (!socketFound) {
      log.terminal.error('dtach socket not found after polling', { terminalId: this.id })
      this.status = 'exited'
      this.exitCode = 1
      this.updateDb({ status: 'exited', exitCode: 1 })
      this.onExit(1)
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
          ...getTerminalEnv(),
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          // Explicitly unset - bun-pty merges with process.env, doesn't replace
          NODE_ENV: '',
          PORT: '',
        },
      })

      this.setupPtyHandlers()
    } catch (err) {
      log.terminal.error('Failed to attach to dtach', { terminalId: this.id, error: String(err) })
      this.status = 'error'
      this.updateDb({ status: 'error' })
      this.onExit(1)
    }
  }

  private setupPtyHandlers(): void {
    if (!this.pty) return

    log.terminal.info('setupPtyHandlers: registering onData handler', { terminalId: this.id })

    this.pty.onData((data) => {
      log.terminal.info('pty.onData fired', { terminalId: this.id, dataLen: data.length })
      this.buffer.append(data)
      this.onData(data)
    })

    this.pty.onExit(({ exitCode }) => {
      this.pty = null

      // If we're intentionally detaching, don't mark as exited
      if (this.isDetaching) {
        return
      }

      const dtach = getDtachService()

      if (!dtach.hasSession(this.id)) {
        // Session actually ended (socket gone)
        this.status = 'exited'
        this.exitCode = exitCode
        this.updateDb({ status: 'exited', exitCode })
        this.onExit(exitCode)
        // Trigger destruction so terminal can be recreated
        this.onShouldDestroy?.()
      }
      // Otherwise dtach is still running, we just detached
    })
  }

  detach(): void {
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
