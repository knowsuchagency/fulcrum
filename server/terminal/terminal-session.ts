import * as pty from '@lydell/node-pty'
import * as os from 'os'
import { BufferManager } from './buffer-manager'
import type { TerminalInfo, TerminalStatus } from '../types'

export interface TerminalSessionOptions {
  id: string
  name: string
  cols: number
  rows: number
  cwd?: string
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
  private ptyProcess: pty.IPty | null = null
  private buffer: BufferManager
  private onData: (data: string) => void
  private onExit: (exitCode: number) => void

  constructor(options: TerminalSessionOptions) {
    this.id = options.id
    this._name = options.name
    this.cols = options.cols
    this.rows = options.rows
    this.cwd = options.cwd || os.homedir()
    this.createdAt = Date.now()
    this.buffer = new BufferManager()
    this.onData = options.onData
    this.onExit = options.onExit
  }

  get name(): string {
    return this._name
  }

  rename(newName: string): void {
    this._name = newName
  }

  start(): void {
    const shell = process.env.SHELL || '/bin/bash'

    try {
      this.ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: this.cols,
        rows: this.rows,
        cwd: this.cwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        } as Record<string, string>,
      })

      this.ptyProcess.onData((data) => {
        this.buffer.append(data)
        this.onData(data)
      })

      this.ptyProcess.onExit(({ exitCode }) => {
        this.status = 'exited'
        this.exitCode = exitCode
        this.onExit(exitCode)
      })
    } catch (err) {
      console.error(`[TerminalSession] Failed to spawn:`, err)
      this.status = 'error'
      this.onExit(1)
    }
  }

  write(data: string): void {
    if (this.ptyProcess && this.status === 'running') {
      this.ptyProcess.write(data)
    }
  }

  resize(cols: number, rows: number): void {
    this.cols = cols
    this.rows = rows
    if (this.ptyProcess && this.status === 'running') {
      this.ptyProcess.resize(cols, rows)
    }
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
    }
  }

  kill(): void {
    if (this.ptyProcess && this.status === 'running') {
      this.ptyProcess.kill()
    }
  }

  isRunning(): boolean {
    return this.status === 'running'
  }
}
