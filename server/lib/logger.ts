// Centralized logging for Fulcrum backend
// Outputs JSON lines to stdout and fulcrum.log file

import { appendFileSync, statSync, renameSync, unlinkSync } from 'fs'
import { join } from 'path'

// Log rotation settings
const MAX_LOG_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_LOG_BACKUPS = 2 // Keep .1 and .2 backups
import { type LogEntry, type LogLevel, type Logger, LOG_LEVELS, formatLogEntry } from '../../shared/logger'
import { getFulcrumDir, ensureFulcrumDir } from './settings'

// Get minimum log level from environment
function getMinLevel(): LogLevel {
  const level = process.env.LOG_LEVEL as LogLevel
  if (level && level in LOG_LEVELS) {
    return level
  }
  return 'info'
}

// Cached log file path (initialized lazily)
let logFilePath: string | null = null

/**
 * Reset the cached log file path.
 * Called during test cleanup to ensure the next log uses the new FULCRUM_DIR.
 */
export function resetLogFilePath(): void {
  logFilePath = null
}

function getLogFile(): string | null {
  if (logFilePath !== null) {
    return logFilePath || null
  }

  try {
    ensureFulcrumDir()
    logFilePath = join(getFulcrumDir(), 'fulcrum.log')
    return logFilePath
  } catch {
    logFilePath = '' // Mark as failed
    return null
  }
}

// Rotate log file if it exceeds MAX_LOG_SIZE
function rotateLogIfNeeded(logFile: string): void {
  try {
    const stats = statSync(logFile)
    if (stats.size < MAX_LOG_SIZE) return

    // Rotate: delete oldest, shift others, rename current
    for (let i = MAX_LOG_BACKUPS; i >= 1; i--) {
      const older = `${logFile}.${i}`
      const newer = i === 1 ? logFile : `${logFile}.${i - 1}`
      try {
        if (i === MAX_LOG_BACKUPS) {
          unlinkSync(older)
        }
      } catch {
        // File doesn't exist, that's fine
      }
      try {
        renameSync(newer, older)
      } catch {
        // Source doesn't exist, that's fine
      }
    }
  } catch {
    // File doesn't exist yet or other error, skip rotation
  }
}

/**
 * Core logging function - writes a log entry to stdout and fulcrum.log
 * Used by both the Logger class and /api/logs endpoint
 */
export function writeEntry(entry: LogEntry): void {
  const line = formatLogEntry(entry)

  // Write to stdout (captured by daemon/nohup)
  console.log(line)

  // Write to log file (with rotation)
  const logFile = getLogFile()
  if (logFile) {
    try {
      rotateLogIfNeeded(logFile)
      appendFileSync(logFile, line + '\n')
    } catch {
      // Ignore file write errors
    }
  }
}

class ServerLogger implements Logger {
  private component: string
  private minLevel: LogLevel

  constructor(component: string, minLevel?: LogLevel) {
    this.component = component
    this.minLevel = minLevel ?? getMinLevel()
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel]
  }

  private log(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return

    writeEntry({
      ts: new Date().toISOString(),
      lvl: level,
      src: this.component,
      msg,
      ...(ctx && Object.keys(ctx).length > 0 ? { ctx } : {}),
    })
  }

  debug(msg: string, ctx?: Record<string, unknown>): void {
    this.log('debug', msg, ctx)
  }

  info(msg: string, ctx?: Record<string, unknown>): void {
    this.log('info', msg, ctx)
  }

  warn(msg: string, ctx?: Record<string, unknown>): void {
    this.log('warn', msg, ctx)
  }

  error(msg: string, ctx?: Record<string, unknown>): void {
    this.log('error', msg, ctx)
  }

  child(component: string): Logger {
    return new ServerLogger(`${this.component}/${component}`, this.minLevel)
  }
}

// Factory function for creating loggers
export function createLogger(component: string): Logger {
  return new ServerLogger(component)
}

// Pre-configured loggers for common components
export const log = {
  db: createLogger('Database'),
  pty: createLogger('PTYManager'),
  ws: createLogger('WS'),
  terminal: createLogger('Terminal'),
  buffer: createLogger('BufferManager'),
  desktop: createLogger('Desktop'),
  api: createLogger('API'),
  metrics: createLogger('MetricsCollector'),
  pr: createLogger('PRMonitor'),
  github: createLogger('GitHub'),
  notification: createLogger('Notification'),
  server: createLogger('Server'),
  settings: createLogger('Settings'),
  deploy: createLogger('Deploy'),
  jobs: createLogger('Jobs'),
}
