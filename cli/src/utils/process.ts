import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { getFulcrumDir } from './server'

/**
 * Gets the path to the PID file.
 */
export function getPidPath(): string {
  return join(getFulcrumDir(), 'fulcrum.pid')
}

/**
 * Writes the PID to the PID file.
 */
export function writePid(pid: number): void {
  const pidPath = getPidPath()
  const dir = dirname(pidPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(pidPath, pid.toString(), 'utf-8')
}

/**
 * Reads the PID from the PID file.
 * Returns null if the file doesn't exist.
 */
export function readPid(): number | null {
  const pidPath = getPidPath()
  try {
    if (existsSync(pidPath)) {
      const content = readFileSync(pidPath, 'utf-8').trim()
      const pid = parseInt(content, 10)
      return isNaN(pid) ? null : pid
    }
  } catch {
    // Ignore errors
  }
  return null
}

/**
 * Removes the PID file.
 */
export function removePid(): void {
  const pidPath = getPidPath()
  try {
    if (existsSync(pidPath)) {
      unlinkSync(pidPath)
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Checks if a process with the given PID is running.
 */
export function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without actually signaling it
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Gets the port from settings or returns default.
 */
export function getPort(portOverride?: string): number {
  if (portOverride) {
    const port = parseInt(portOverride, 10)
    if (!isNaN(port)) return port
  }

  // Check PORT env var
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT, 10)
    if (!isNaN(port)) return port
  }

  return 7777
}
