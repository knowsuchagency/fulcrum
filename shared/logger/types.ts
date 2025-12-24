// Centralized logging types for Vibora
// Used by both frontend and backend

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  ts: string // ISO 8601 timestamp
  lvl: LogLevel // Level
  src: string // Source component
  msg: string // Message
  ctx?: Record<string, unknown> // Structured context for AI searchability
}

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void
  info(msg: string, ctx?: Record<string, unknown>): void
  warn(msg: string, ctx?: Record<string, unknown>): void
  error(msg: string, ctx?: Record<string, unknown>): void
  child(component: string): Logger
}

// Log level priority for filtering
export const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// Format a log entry as a JSON line
export function formatLogEntry(entry: LogEntry): string {
  return JSON.stringify(entry)
}

// Parse a JSON line back to a log entry
export function parseLogEntry(line: string): LogEntry | null {
  try {
    return JSON.parse(line) as LogEntry
  } catch {
    return null
  }
}
