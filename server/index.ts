import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { createServer } from 'net'
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
import { startMessagingChannels, stopMessagingChannels } from './services/messaging'
import { log } from './lib/logger'
import { clearSensitiveEnvVars } from './lib/env'

// Clear sensitive env vars inherited from parent shell before reading settings
clearSensitiveEnvVars()

// Ensure settings file is up-to-date with latest schema on startup
ensureLatestSettings()

const PORT = getSettingByKey('port')
const HOST = process.env.HOST || 'localhost'

// Check if port is already in use before starting
async function checkPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, host)
  })
}

const portAvailable = await checkPortAvailable(PORT, HOST)
if (!portAvailable) {
  log.server.error('Port already in use', { port: PORT, host: HOST })
  console.error(`Error: Port ${PORT} is already in use. Another server may be running.`)
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

// Graceful shutdown - detach PTYs but keep dtach sessions running for persistence
process.on('SIGINT', async () => {
  log.server.info('Shutting down (terminals will persist)')
  stopPRMonitor()
  stopMetricsCollector()
  stopGitWatcher()
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
  await stopMessagingChannels()
  ptyManager.detachAll()
  server.close()
  process.exit(0)
})
