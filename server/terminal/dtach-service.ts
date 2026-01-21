import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { getFulcrumDir } from '../lib/settings'
import { log } from '../lib/logger'

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

  // Validate that a socket is actually functional (not stale)
  // This tries to connect to the socket briefly to check if dtach is listening
  validateSocket(terminalId: string): boolean {
    const socketPath = this.getSocketPath(terminalId)

    // First check if the socket file exists
    if (!existsSync(socketPath)) {
      log.pty.debug('validateSocket: socket file does not exist', { terminalId, socketPath })
      return false
    }

    // Check if it's actually a socket file
    try {
      const stats = statSync(socketPath)
      if (!stats.isSocket()) {
        log.pty.warn('validateSocket: path exists but is not a socket', {
          terminalId,
          socketPath,
          mode: stats.mode,
        })
        return false
      }
    } catch (err) {
      log.pty.warn('validateSocket: failed to stat socket', {
        terminalId,
        socketPath,
        error: String(err),
      })
      return false
    }

    // Try to connect to the socket using socat or nc with a short timeout
    // dtach -a would work but spawns a shell - instead we just probe the socket
    try {
      // Use a simple test: check if there's a dtach process using this socket
      const dtachPids = findProcessesByArg(socketPath)
      if (dtachPids.length === 0) {
        log.pty.warn('validateSocket: no dtach process found for socket', {
          terminalId,
          socketPath,
        })
        return false
      }

      log.pty.debug('validateSocket: dtach process found', {
        terminalId,
        socketPath,
        pids: dtachPids,
      })
      return true
    } catch (err) {
      log.pty.warn('validateSocket: failed to find dtach process', {
        terminalId,
        socketPath,
        error: String(err),
      })
      return false
    }
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

/**
 * Reset the dtach service singleton.
 * Called during test cleanup to ensure the next getDtachService() uses the new FULCRUM_DIR.
 */
export function resetDtachService(): void {
  dtachService = null
}
