import { output, isJsonOutput } from '../utils/output'
import { readPid, isProcessRunning, getPort } from '../utils/process'
import { discoverServerUrl } from '../utils/server'

export async function handleStatusCommand(flags: Record<string, string>) {
  const pid = readPid()
  const port = getPort(flags.port)
  const serverUrl = discoverServerUrl(flags.url, flags.port)

  // Check if PID file exists and process is running
  const pidRunning = pid !== null && isProcessRunning(pid)

  // Ping health endpoint for status and details
  let healthOk = false
  let version: string | null = null
  let uptime: number | null = null
  if (pidRunning) {
    try {
      const res = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(2000) })
      healthOk = res.ok
      if (res.ok) {
        const health = await res.json()
        version = health.version || null
        uptime = health.uptime || null
      }
    } catch {
      // Server not responding
    }
  }

  const data = {
    running: pidRunning,
    healthy: healthOk,
    pid: pid || null,
    port,
    url: serverUrl,
    version,
    uptime,
  }

  if (isJsonOutput()) {
    output(data)
  } else {
    if (pidRunning) {
      const healthStatus = healthOk ? 'healthy' : 'not responding'
      console.log(`Fulcrum is running (${healthStatus})`)
      console.log(`  PID:  ${pid}`)
      console.log(`  URL:  ${serverUrl}`)
      if (version) console.log(`  Version: ${version}`)
      if (uptime) console.log(`  Uptime:  ${Math.floor(uptime / 1000)}s`)
    } else {
      console.log('Fulcrum is not running')
      console.log(`\nStart with: fulcrum up`)
    }
  }
}
