import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { createApp } from './app'
import { initPTYManager, setBroadcastDestroyed } from './terminal/pty-instance'
import {
  terminalWebSocketHandlers,
  broadcast,
  broadcastToTerminal,
} from './websocket/terminal-ws'
import { ensureLatestSettings, getSettingByKey } from './lib/settings'
import { startPRMonitor, stopPRMonitor } from './services/pr-monitor'
import { startMetricsCollector, stopMetricsCollector } from './services/metrics-collector'
import { startGitWatcher, stopGitWatcher } from './services/git-watcher'
import { startMessagingChannels, stopMessagingChannels } from './services/channels'
import { startAssistantScheduler, stopAssistantScheduler } from './services/assistant-scheduler'
import { log } from './lib/logger'
import { clearSensitiveEnvVars } from './lib/env'

// Clear sensitive env vars inherited from parent shell before reading settings
clearSensitiveEnvVars()

// Ensure settings file is up-to-date with latest schema on startup
ensureLatestSettings()

const PORT = getSettingByKey('port')
const HOST = process.env.HOST || 'localhost'

// Check if port is already in use on any network interface
async function checkPortAvailable(port: number): Promise<{ available: boolean; pid?: number }> {
  const { execSync } = await import('child_process')

  try {
    // Use lsof to check if anything is listening on this port
    const result = execSync(`lsof -i :${port} -sTCP:LISTEN -t 2>/dev/null`, {
      encoding: 'utf-8',
    }).trim()

    if (result) {
      // Port is in use - get the first PID
      const pid = parseInt(result.split('\n')[0], 10)
      return { available: false, pid }
    }
  } catch {
    // lsof returns non-zero if nothing found - port is available
  }

  return { available: true }
}

// Check if database is already in use by another process
async function checkDatabaseAvailable(): Promise<{ available: boolean; error?: string; pid?: number }> {
  const { getDatabasePath } = await import('./lib/settings')
  const { execSync } = await import('child_process')
  const dbPath = getDatabasePath()

  try {
    // Use lsof to check if any other process has the database open
    const result = execSync(`lsof -t "${dbPath}" 2>/dev/null`, {
      encoding: 'utf-8',
    }).trim()

    if (result) {
      // Database is in use - get the first PID
      const pid = parseInt(result.split('\n')[0], 10)
      return {
        available: false,
        error: `Database is already in use by process ${pid}: ${dbPath}`,
        pid,
      }
    }
  } catch {
    // lsof returns non-zero if nothing found or file doesn't exist - database is available
  }

  return { available: true }
}

// Startup checks
const portCheck = await checkPortAvailable(PORT)
if (!portCheck.available) {
  log.server.error('Port already in use', { port: PORT, pid: portCheck.pid })
  console.error(`Error: Port ${PORT} is already in use by process ${portCheck.pid}. Another server may be running.`)
  process.exit(1)
}

const dbCheck = await checkDatabaseAvailable()
if (!dbCheck.available) {
  log.server.error('Database locked', { error: dbCheck.error })
  console.error(`Error: ${dbCheck.error}`)
  console.error('Another Fulcrum server may be running. Stop it first or use a different FULCRUM_DIR.')
  process.exit(1)
}

// Initialize PTY manager with broadcast callbacks
const ptyManager = initPTYManager({
  onData: (terminalId, data) => {
    broadcastToTerminal(terminalId, {
      type: 'terminal:output',
      payload: { terminalId, data },
    })
  },
  onExit: (terminalId, exitCode, status) => {
    broadcast({
      type: 'terminal:exit',
      payload: { terminalId, exitCode, status },
    })
  },
})

// Restore terminals from database (reconnect to existing dtach sessions)
await ptyManager.restoreFromDatabase()

// Set up broadcast function for terminal destruction from task deletion
setBroadcastDestroyed((terminalId) => {
  broadcast({
    type: 'terminal:destroyed',
    payload: { terminalId },
  })
})

// Create Hono app
const app = createApp()

// Create WebSocket helper
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

// Add WebSocket route
app.get('/ws/terminal', upgradeWebSocket(() => terminalWebSocketHandlers))

// Start server
const server = serve(
  {
    fetch: app.fetch,
    port: PORT,
    hostname: HOST,
  },
  (info) => {
    log.server.info('Fulcrum server running', {
      port: info.port,
      healthCheck: `http://localhost:${info.port}/health`,
      api: `http://localhost:${info.port}/api/tasks`,
      webSocket: `ws://localhost:${info.port}/ws/terminal`,
    })
  }
)

// Inject WebSocket support
injectWebSocket(server)

// Start PR monitor service
startPRMonitor()

// Start metrics collector for monitoring
startMetricsCollector()

// Start git watcher for auto-deploy
startGitWatcher()

// Start messaging channels (WhatsApp, etc.)
startMessagingChannels()

// Start assistant scheduler (hourly sweeps, daily rituals)
startAssistantScheduler()

// Graceful shutdown - detach PTYs but keep dtach sessions running for persistence
process.on('SIGINT', async () => {
  log.server.info('Shutting down (terminals will persist)')
  stopPRMonitor()
  stopMetricsCollector()
  stopGitWatcher()
  stopAssistantScheduler()
  await stopMessagingChannels()
  ptyManager.detachAll()
  server.close()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  log.server.info('Shutting down (terminals will persist)')
  stopPRMonitor()
  stopMetricsCollector()
  stopGitWatcher()
  stopAssistantScheduler()
  await stopMessagingChannels()
  ptyManager.detachAll()
  server.close()
  process.exit(0)
})
