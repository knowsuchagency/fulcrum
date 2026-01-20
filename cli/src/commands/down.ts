import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import { readPid, removePid, isProcessRunning } from '../utils/process'

export async function handleDownCommand() {
  const pid = readPid()

  if (!pid) {
    throw new CliError(
      'NOT_RUNNING',
      'No PID file found. Fulcrum server may not be running.',
      ExitCodes.ERROR
    )
  }

  if (!isProcessRunning(pid)) {
    // Process not running, just clean up PID file
    removePid()
    if (isJsonOutput()) {
      output({ stopped: true, pid, wasRunning: false })
    } else {
      console.log(`Fulcrum was not running (stale PID file cleaned up)`)
    }
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

  if (isJsonOutput()) {
    output({ stopped: true, pid, wasRunning: true })
  } else {
    console.log(`Fulcrum stopped (PID: ${pid})`)
  }
}
