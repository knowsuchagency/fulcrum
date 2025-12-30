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

let jsonOutput = false

export function setJsonOutput(value: boolean) {
  jsonOutput = value
}

export function isJsonOutput(): boolean {
  return jsonOutput
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
  if (jsonOutput) {
    output({ message })
  } else {
    prettyLog('success', message)
  }
}

export function output<T>(data: T): void {
  const response: SuccessResponse<T> = {
    success: true,
    data,
  }
  console.log(JSON.stringify(response))
}

export function outputError(error: CliError): never {
  if (jsonOutput) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    }
    console.log(JSON.stringify(response))
  } else {
    console.error(`Error: ${error.message}`)
  }
  process.exit(error.exitCode)
}

export function outputErrorAndExit(
  exitCode: ExitCode,
  code: string,
  message: string
): never {
  if (jsonOutput) {
    const response: ErrorResponse = {
      success: false,
      error: { code, message },
    }
    console.log(JSON.stringify(response))
  } else {
    console.error(`Error: ${message}`)
  }
  process.exit(exitCode)
}
