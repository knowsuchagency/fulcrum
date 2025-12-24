// Centralized logging for Vibora backend
// Outputs JSON lines to stdout (and optionally to file)

import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { type LogEntry, type LogLevel, type Logger, LOG_LEVELS, formatLogEntry } from '../../shared/logger'
import { getViboraDir, ensureViboraDir } from './settings'

// Get minimum log level from environment
function getMinLevel(): LogLevel {
  const level = process.env.LOG_LEVEL as LogLevel
  if (level && level in LOG_LEVELS) {
    return level
  }
  return 'info'
}

// Get log file path
function getLogFilePath(): string {
  return join(getViboraDir(), 'vibora.log')
}

class ServerLogger implements Logger {
  private component: string
  private minLevel: LogLevel
  private logFile: string | null = null

  constructor(component: string, minLevel?: LogLevel) {
    this.component = component
    this.minLevel = minLevel ?? getMinLevel()

    // Initialize log file path (lazy - only when we first log)
    this.logFile = null
  }

  private ensureLogFile(): string | null {
    if (this.logFile !== null) {
      return this.logFile
    }

    try {
      ensureViboraDir()
      this.logFile = getLogFilePath()
      return this.logFile
    } catch {
      // Can't create log file, will only log to stdout
      this.logFile = ''
      return null
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel]
  }

  private log(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      lvl: level,
      src: this.component,
      msg,
      ...(ctx && Object.keys(ctx).length > 0 ? { ctx } : {}),
    }

    const line = formatLogEntry(entry)

    // Write to stdout (captured by daemon/nohup)
    console.log(line)

    // Also write to log file if available
    const logFile = this.ensureLogFile()
    if (logFile) {
      try {
        appendFileSync(logFile, line + '\n')
      } catch {
        // Ignore file write errors
      }
    }
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
  pty: createLogger('PTYManager'),
  ws: createLogger('WS'),
  terminal: createLogger('Terminal'),
  buffer: createLogger('BufferManager'),
  desktop: createLogger('Desktop'),
  api: createLogger('API'),
  metrics: createLogger('MetricsCollector'),
  pr: createLogger('PRMonitor'),
  github: createLogger('GitHub'),
  linear: createLogger('Linear'),
  notification: createLogger('Notification'),
  server: createLogger('Server'),
}
