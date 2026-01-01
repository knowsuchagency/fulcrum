export type LogType = 'error' | 'warning' | 'success' | 'info' | 'debug'

export interface LogLine {
  message: string
  type: LogType
}

const ERROR_PATTERNS = /error|exception|failed|uncaught|fatal|crash|errno|reject/i
const WARNING_PATTERNS = /warning|deprecated|caution|unstable|⚠️/i
const SUCCESS_PATTERNS =
  /successfully|completed|listening|connected|ready|started|✓|✅|done|healthy|pulled|created|recreated/i
const DEBUG_PATTERNS = /debug|version|config|import|GET|POST|PUT|DELETE/i

export function getLogType(message: string): LogType {
  if (ERROR_PATTERNS.test(message)) return 'error'
  if (WARNING_PATTERNS.test(message)) return 'warning'
  if (SUCCESS_PATTERNS.test(message)) return 'success'
  if (DEBUG_PATTERNS.test(message)) return 'debug'
  return 'info'
}

export function parseLogs(logString: string): LogLine[] {
  return logString
    .split('\n')
    .filter((line) => line.trim())
    .map((message) => ({
      message,
      type: getLogType(message),
    }))
}
