// Centralized logging for Vibora frontend
// Batches logs and sends to backend via /api/logs

import type { LogEntry, LogLevel, Logger } from '../../shared/logger'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// Check if logging to server is enabled (set via DEBUG=1 or VITE_VIBORA_DEBUG=1 at build time)
// __VIBORA_DEBUG__ is replaced at build time by Vite's define config
const DEBUG_ENABLED = __VIBORA_DEBUG__
const IS_DEV = import.meta.env.DEV

// Get minimum log level from environment
function getMinLevel(): LogLevel {
  const level = import.meta.env.VITE_LOG_LEVEL as LogLevel
  if (level && level in LOG_LEVELS) {
    return level
  }
  return IS_DEV ? 'debug' : 'info'
}

// Shared log buffer and flush logic
let logBuffer: LogEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_INTERVAL = 1000 // 1 second
const MAX_BUFFER_SIZE = 50

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flush()
  }, FLUSH_INTERVAL)
}

function flush(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }

  if (logBuffer.length === 0) return

  const entries = [...logBuffer]
  logBuffer = []

  // Send to server (fire and forget)
  fetch('/api/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  }).catch(() => {
    // Re-add to buffer on failure (limited retry)
    if (logBuffer.length < MAX_BUFFER_SIZE * 2) {
      logBuffer.unshift(...entries)
    }
  })
}

// Flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (logBuffer.length > 0) {
      // Use sendBeacon for reliable delivery on unload
      const data = JSON.stringify({ entries: logBuffer })
      navigator.sendBeacon('/api/logs', data)
      logBuffer = []
    }
  })
}

class FrontendLogger implements Logger {
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

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      lvl: level,
      src: `Frontend/${this.component}`,
      msg,
      ...(ctx && Object.keys(ctx).length > 0 ? { ctx } : {}),
    }

    // Log to console in development or when debug mode is enabled
    if (IS_DEV || DEBUG_ENABLED) {
      const consoleMethod = level === 'debug' ? 'log' : level
      console[consoleMethod](`[${entry.src}]`, msg, ctx ?? '')
    }

    // Send to server in dev mode or when debug mode is enabled
    if (IS_DEV || DEBUG_ENABLED) {
      logBuffer.push(entry)

      // Flush if buffer is full
      if (logBuffer.length >= MAX_BUFFER_SIZE) {
        flush()
      } else {
        scheduleFlush()
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
    return new FrontendLogger(`${this.component}/${component}`, this.minLevel)
  }
}

// No-op logger for when logging is completely disabled
const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => noopLogger,
}

// Factory function for creating loggers
export function createLogger(component: string): Logger {
  // In production without debug mode, return no-op logger
  if (!IS_DEV && !DEBUG_ENABLED) {
    return noopLogger
  }
  return new FrontendLogger(component)
}

// Pre-configured loggers for common components
export const log = {
  terminal: createLogger('Terminal'),
  terminalsView: createLogger('TerminalsView'),
  projectTerminals: createLogger('ProjectTerminals'),
  ws: createLogger('WebSocket'),
  taskTerminal: createLogger('TaskTerminal'),
  repoTerminal: createLogger('RepoTerminal'),
  kanban: createLogger('Kanban'),
  viewer: createLogger('Viewer'),
  deployment: createLogger('Deployment'),
}
