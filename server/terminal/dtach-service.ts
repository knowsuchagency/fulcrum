import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { getViboraDir } from '../lib/settings'

// Find process IDs by matching command line arguments
function findProcessesByArg(searchArg: string): number[] {
  const pids: number[] = []
  try {
    const procDirs = readdirSync('/proc').filter((d) => /^\d+$/.test(d))
    for (const pid of procDirs) {
      try {
        const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf-8')
        if (cmdline.includes(searchArg)) {
          pids.push(parseInt(pid, 10))
        }
      } catch {
        // Process may have exited, skip
      }
    }
  } catch {
    // /proc not available (non-Linux), fallback to pgrep
    try {
      const result = execSync(`pgrep -f "${searchArg}"`, { encoding: 'utf-8' })
      for (const line of result.trim().split('\n')) {
        const pid = parseInt(line, 10)
        if (!isNaN(pid)) pids.push(pid)
      }
    } catch {
      // No matches
    }
  }
  return pids
}

// Get all descendant PIDs of a process
function getDescendantPids(pid: number): number[] {
  const descendants: number[] = []
  try {
    // Use ps to get all children recursively
    const result = execSync(`ps --ppid ${pid} -o pid= 2>/dev/null || true`, { encoding: 'utf-8' })
    for (const line of result.trim().split('\n')) {
      const childPid = parseInt(line.trim(), 10)
      if (!isNaN(childPid)) {
        descendants.push(childPid)
        descendants.push(...getDescendantPids(childPid))
      }
    }
  } catch {
    // Ignore errors
  }
  return descendants
}

// Kill a process tree (parent and all descendants)
export function killProcessTree(pid: number): void {
  const descendants = getDescendantPids(pid)

  // Kill children first (deepest first), then parent
  for (const childPid of descendants.reverse()) {
    try {
      process.kill(childPid, 'SIGKILL')
    } catch {
      // Process may have already exited
    }
  }

  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // Process may have already exited
  }
}

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
  getCreateCommand(terminalId: string): string[] {
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

  // Kill the dtach session and all its child processes
  killSession(terminalId: string): void {
    const socketPath = this.getSocketPath(terminalId)

    // Find dtach process(es) using this socket
    const dtachPids = findProcessesByArg(socketPath)

    for (const pid of dtachPids) {
      killProcessTree(pid)
    }
  }

  // Check if dtach is available
  static isAvailable(): boolean {
    try {
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
