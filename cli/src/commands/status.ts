import { output } from '../utils/output'
import { readPid, isProcessRunning, getPort } from '../utils/process'
import { discoverServerUrl } from '../utils/server'

export async function handleStatusCommand(flags: Record<string, string>) {
  const pid = readPid()
  const port = getPort(flags.port)
  const serverUrl = discoverServerUrl(flags.url, flags.port)

  // Check if PID file exists and process is running
  const pidRunning = pid !== null && isProcessRunning(pid)

  // Optionally ping health endpoint
  let healthOk = false
  if (pidRunning) {
    try {
      const res = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(2000) })
      healthOk = res.ok
    } catch {
      // Server not responding
    }
  }

  output({
    running: pidRunning,
    healthy: healthOk,
    pid: pid || null,
    port,
    url: serverUrl,
  })
}
