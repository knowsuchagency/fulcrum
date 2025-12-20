import { existsSync, mkdirSync } from 'fs'
import * as path from 'path'
import { getViboraDir } from '../lib/settings'

export class DtachService {
  private socketsDir: string

  constructor() {
    this.socketsDir = path.join(getViboraDir(), 'sockets')
    // Ensure sockets directory exists
    if (!existsSync(this.socketsDir)) {
      mkdirSync(this.socketsDir, { recursive: true })
    }
  }

  getSocketPath(terminalId: string): string {
    return path.join(this.socketsDir, `terminal-${terminalId}.sock`)
  }

  hasSession(terminalId: string): boolean {
    return existsSync(this.getSocketPath(terminalId))
  }

  // Get command to create a new detached session
  getCreateCommand(terminalId: string, cwd: string): string[] {
    const socketPath = this.getSocketPath(terminalId)
    const shell = process.env.SHELL || '/bin/bash'
    // -n: don't attach after creating
    // -z: use the specified socket path
    return ['dtach', '-n', socketPath, '-z', shell]
  }

  // Get command to attach to an existing session
  getAttachCommand(terminalId: string): string[] {
    const socketPath = this.getSocketPath(terminalId)
    // -a: attach to existing socket
    // -z: disable suspend key (Ctrl-Z won't detach)
    return ['dtach', '-a', socketPath, '-z']
  }

  // Check if dtach is available
  static isAvailable(): boolean {
    try {
      const { execSync } = require('child_process')
      execSync('which dtach', { encoding: 'utf-8' })
      return true
    } catch {
      return false
    }
  }
}

// Singleton
let dtachService: DtachService | null = null

export function getDtachService(): DtachService {
  if (!dtachService) {
    dtachService = new DtachService()
  }
  return dtachService
}
