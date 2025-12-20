import { execSync, spawnSync } from 'child_process'
import * as path from 'path'
import { getViboraDir } from '../lib/settings'

const TMUX_SESSION_PREFIX = 'vibora-'

export class TmuxService {
  private socketPath: string

  constructor() {
    this.socketPath = path.join(getViboraDir(), 'tmux.sock')
  }

  private tmux(args: string): string {
    return execSync(`tmux -S "${this.socketPath}" ${args}`, {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim()
  }

  private tmuxNoFail(args: string): string | null {
    try {
      return this.tmux(args)
    } catch {
      return null
    }
  }

  getSocketPath(): string {
    return this.socketPath
  }

  getSessionName(terminalId: string): string {
    return `${TMUX_SESSION_PREFIX}${terminalId}`
  }

  parseTerminalId(sessionName: string): string | null {
    if (sessionName.startsWith(TMUX_SESSION_PREFIX)) {
      return sessionName.slice(TMUX_SESSION_PREFIX.length)
    }
    return null
  }

  createSession(terminalId: string, cwd: string, cols: number, rows: number): boolean {
    const sessionName = this.getSessionName(terminalId)
    try {
      const shell = process.env.SHELL || '/bin/bash'
      // Create session with status bar disabled and escape-time set to 0
      // to avoid input delays and interference with xterm.js
      this.tmux(
        `new-session -d -s "${sessionName}" -c "${cwd}" -x ${cols} -y ${rows} "${shell}"`
      )
      // Disable status bar for this session
      this.tmux(`set-option -t "${sessionName}" status off`)
      // Set escape-time to 0 to avoid input delays
      this.tmux(`set-option -t "${sessionName}" escape-time 0`)
      return true
    } catch (err) {
      console.error(`[TmuxService] Failed to create session ${sessionName}:`, err)
      return false
    }
  }

  hasSession(terminalId: string): boolean {
    const sessionName = this.getSessionName(terminalId)
    const result = spawnSync('tmux', ['-S', this.socketPath, 'has-session', '-t', sessionName], {
      encoding: 'utf-8',
    })
    return result.status === 0
  }

  killSession(terminalId: string): boolean {
    const sessionName = this.getSessionName(terminalId)
    return this.tmuxNoFail(`kill-session -t "${sessionName}"`) !== null
  }

  resizeSession(terminalId: string, cols: number, rows: number): boolean {
    const sessionName = this.getSessionName(terminalId)
    try {
      // Resize the window which will resize all panes
      this.tmux(`resize-window -t "${sessionName}" -x ${cols} -y ${rows}`)
      return true
    } catch {
      return false
    }
  }

  listViboraSessions(): string[] {
    const output = this.tmuxNoFail('list-sessions -F "#{session_name}"')
    if (!output) return []
    return output
      .split('\n')
      .filter((name) => name.startsWith(TMUX_SESSION_PREFIX))
  }

  capturePane(terminalId: string, historyLimit = 10000): string {
    const sessionName = this.getSessionName(terminalId)
    try {
      return this.tmux(`capture-pane -t "${sessionName}" -p -S -${historyLimit}`)
    } catch {
      return ''
    }
  }

  getAttachCommand(terminalId: string): string[] {
    const sessionName = this.getSessionName(terminalId)
    // Use send-keys for input and capture-pane for output approach
    // Don't use attach-session as it sends terminal escape sequences
    return ['tmux', '-S', this.socketPath, 'attach-session', '-t', sessionName]
  }

  // Send input directly to the tmux pane
  sendKeys(terminalId: string, keys: string): boolean {
    const sessionName = this.getSessionName(terminalId)
    try {
      // Use -l for literal keys to avoid special interpretation
      const escaped = keys.replace(/'/g, "'\\''")
      this.tmux(`send-keys -t "${sessionName}" -l '${escaped}'`)
      return true
    } catch {
      return false
    }
  }

  // Get the pane's tty path for direct connection
  getPaneTty(terminalId: string): string | null {
    const sessionName = this.getSessionName(terminalId)
    try {
      return this.tmux(`display-message -t "${sessionName}" -p "#{pane_tty}"`)
    } catch {
      return null
    }
  }

  // Check if tmux is available
  static isAvailable(): boolean {
    try {
      execSync('which tmux', { encoding: 'utf-8' })
      return true
    } catch {
      return false
    }
  }
}

// Singleton
let tmuxService: TmuxService | null = null

export function getTmuxService(): TmuxService {
  if (!tmuxService) {
    tmuxService = new TmuxService()
  }
  return tmuxService
}
