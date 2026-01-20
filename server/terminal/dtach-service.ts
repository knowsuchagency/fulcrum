import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { getFulcrumDir } from '../lib/settings'

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

// Combined pattern for all supported AI agents (Claude Code, OpenCode)
// Must be preceded by / or start, and followed by whitespace/null/end
// This avoids matching directory paths like /fulcrum/opencode/sockets/ or /worktrees/claude-test/
const AGENT_PATTERN = /(^|\/)(claude|opencode)(\s|\0|$)/i

// Check if a process is an AI agent process by examining its command line
function isAgentProcess(pid: number): boolean {
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf-8')
    return AGENT_PATTERN.test(cmdline)
  } catch {
    // /proc not available (non-Linux), try ps
    try {
      const result = execSync(`ps -p ${pid} -o args= 2>/dev/null || true`, {
        encoding: 'utf-8',
      })
      return AGENT_PATTERN.test(result)
    } catch {
      return false
    }
  }
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
    this.socketsDir = path.join(getFulcrumDir(), 'sockets')
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
    return ['dtach', '-n', socketPath, '-z', shell, '-li']
  }

  // Get command to attach to an existing session
  getAttachCommand(terminalId: string): string[] {
    const socketPath = this.getSocketPath(terminalId)
    // -echoctl: don't echo control chars as ^X (prevents ^P showing for Ctrl+P)
    // Normal echo is preserved so typing is visible. Only control char display is suppressed.
    return ['bash', '-c', `stty -echoctl && exec dtach -a ${socketPath} -z`]
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

  // Kill AI agent processes within a dtach session (but keep shell running)
  killAgentInSession(terminalId: string): boolean {
    const socketPath = this.getSocketPath(terminalId)

    // Find dtach process(es) using this socket
    const dtachPids = findProcessesByArg(socketPath)

    let killedAny = false
    for (const dtachPid of dtachPids) {
      // Get all descendant processes
      const descendants = getDescendantPids(dtachPid)

      // Find agent processes among descendants
      for (const pid of descendants) {
        if (isAgentProcess(pid)) {
          killProcessTree(pid)
          killedAny = true
        }
      }
    }

    return killedAny
  }

  // Legacy alias for backward compatibility
  killClaudeInSession(terminalId: string): boolean {
    return this.killAgentInSession(terminalId)
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
