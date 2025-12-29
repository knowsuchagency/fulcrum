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
import { getSettingByKey } from './lib/settings'
import { startPRMonitor, stopPRMonitor } from './services/pr-monitor'
import { startMetricsCollector, stopMetricsCollector } from './services/metrics-collector'
import { log } from './lib/logger'

/**
 * Validates that a port number is within the valid range.
 * @param port - The port number to validate
 * @returns true if port is valid, false otherwise
 */
function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535
}

/**
 * Validates that a hostname is properly formatted.
 * @param host - The hostname to validate
 * @returns true if hostname is valid, false otherwise
 */
function isValidHostname(host: string): boolean {
  if (!host || typeof host !== 'string') return false
  // Allow localhost, IP addresses, and domain names
  const hostnameRegex = /^(localhost|(\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*)*)$/
  return hostnameRegex.test(host)
}

const PORT = getSettingByKey('port')
const HOST = process.env.HOST || 'localhost'

// Validate environment configuration before proceeding
if (!isValidPort(PORT)) {
  log.server.error('Invalid port configuration', { port: PORT })
  console.error(`Error: Invalid port number "${PORT}". Port must be between 1 and 65535.`)
  process.exit(1)
}

if (!isValidHostname(HOST)) {
  log.server.error('Invalid hostname configuration', { host: HOST })
  console.error(`Error: Invalid hostname "${HOST}". Please provide a valid hostname.`)
  process.exit(1)
}

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
  onExit: (terminalId, exitCode) => {
    broadcast({
      type: 'terminal:exit',
      payload: { terminalId, exitCode },
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
