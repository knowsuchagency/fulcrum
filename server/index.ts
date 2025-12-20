import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { createApp } from './app'
import { initPTYManager, getPTYManager, setBroadcastDestroyed } from './terminal/pty-instance'
import {
  terminalWebSocketHandlers,
  broadcast,
  broadcastToTerminal,
} from './websocket/terminal-ws'
import { getSetting } from './lib/settings'

const PORT = parseInt(process.env.PORT || String(getSetting('port')), 10)

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
    console.log(`Vibora server running on port ${info.port}`)
    console.log(`  Health check: http://localhost:${info.port}/health`)
    console.log(`  API:          http://localhost:${info.port}/api/tasks`)
    console.log(`  WebSocket:    ws://localhost:${info.port}/ws/terminal`)
  }
)

// Inject WebSocket support
injectWebSocket(server)

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...')
  ptyManager.destroyAll()
  server.close()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\nShutting down...')
  ptyManager.destroyAll()
  server.close()
  process.exit(0)
})
