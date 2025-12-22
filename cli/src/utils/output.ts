import type { ExitCode, CliError } from './errors'

interface SuccessResponse<T> {
  success: true
  data: T
}

interface ErrorResponse {
  success: false
  error: {
    code: string
    message: string
  }
}

let prettyOutput = false

export function setPrettyOutput(value: boolean) {
  prettyOutput = value
}

export function isPrettyOutput(): boolean {
  return prettyOutput
}

export function prettyLog(type: 'success' | 'info' | 'error' | 'warning', message: string): void {
  const prefixes = {
    success: '✓',
    info: '→',
    error: '✗',
    warning: '⚠',
  }
  console.log(`${prefixes[type]} ${message}`)
}

export function outputSuccess(message: string): void {
  if (prettyOutput) {
    prettyLog('success', message)
  } else {
    output({ message })
  }
}

export function output<T>(data: T): void {
  const response: SuccessResponse<T> = {
    success: true,
    data,
  }
  console.log(prettyOutput ? JSON.stringify(response, null, 2) : JSON.stringify(response))
}

export function outputError(error: CliError): never {
  const response: ErrorResponse = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
    },
  }
  console.log(prettyOutput ? JSON.stringify(response, null, 2) : JSON.stringify(response))
  process.exit(error.exitCode)
}

export function outputErrorAndExit(
  exitCode: ExitCode,
  code: string,
  message: string
): never {
  const response: ErrorResponse = {
    success: false,
    error: { code, message },
  }
  console.log(prettyOutput ? JSON.stringify(response, null, 2) : JSON.stringify(response))
  process.exit(exitCode)
}
