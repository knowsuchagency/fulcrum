import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { createApp } from './app'
import { initPTYManager, setBroadcastDestroyed } from './terminal/pty-instance'
import {
  terminalWebSocketHandlers,
  broadcast,
  broadcastToTerminal,
} from './websocket/terminal-ws'
import { getSettingByKey } from './lib/settings'
import { startPRMonitor, stopPRMonitor } from './services/pr-monitor'
import { startMetricsCollector, stopMetricsCollector } from './services/metrics-collector'
import { log } from './lib/logger'

const PORT = getSettingByKey('port')

// Initialize PTY manager with broadcast callbacks
const ptyManager = initPTYManager({
  onData: (terminalId, data) => {
    broadcastToTerminal(terminalId, {
      type: 'terminal:output',
      payload: { terminalId, data },
    })
  },
  onExit: (terminalId, exitCode) => {
    broadcast({
      type: 'terminal:exit',
      payload: { terminalId, exitCode },
    })
  },
})

// Restore terminals from database (reconnect to existing tmux sessions)
ptyManager.restoreFromDatabase()

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
    hostname: '0.0.0.0',
  },
  (info) => {
    log.server.info('Vibora server running', {
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

// Graceful shutdown - detach PTYs but keep tmux sessions running for persistence
process.on('SIGINT', () => {
  log.server.info('Shutting down (terminals will persist)')
  stopPRMonitor()
  stopMetricsCollector()
  ptyManager.detachAll()
  server.close()
  process.exit(0)
})

process.on('SIGTERM', () => {
  log.server.info('Shutting down (terminals will persist)')
  stopPRMonitor()
  stopMetricsCollector()
  ptyManager.detachAll()
  server.close()
  process.exit(0)
})
