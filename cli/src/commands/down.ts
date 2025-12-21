import { output } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import { readPid, removePid, isProcessRunning } from '../utils/process'

export async function handleDownCommand(_flags: Record<string, string>) {
  const pid = readPid()

  if (!pid) {
    throw new CliError(
      'NOT_RUNNING',
      'No PID file found. Vibora server may not be running.',
      ExitCodes.ERROR
    )
  }

  if (!isProcessRunning(pid)) {
    // Process not running, just clean up PID file
    removePid()
    output({ stopped: true, pid, wasRunning: false })
    return
  }

  // Send SIGTERM to gracefully stop the server
  try {
    process.kill(pid, 'SIGTERM')
  } catch (err) {
    throw new CliError(
      'KILL_FAILED',
      `Failed to stop server (PID: ${pid}): ${err}`,
      ExitCodes.ERROR
    )
  }

  // Wait for process to exit (up to 5 seconds)
  let attempts = 0
  while (attempts < 50 && isProcessRunning(pid)) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    attempts++
  }

  // Force kill if still running
  if (isProcessRunning(pid)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Ignore - might have just exited
    }
  }

  // Clean up PID file
  removePid()

  output({ stopped: true, pid, wasRunning: true })
}
