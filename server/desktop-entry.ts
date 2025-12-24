/**
 * Vibora Desktop Server Entry Point
 *
 * This is the entry point for the Vibora server when running as a Neutralinojs extension.
 * It handles:
 * 1. Reading Neutralino connectivity info from stdin
 * 2. Starting the Vibora server on an available port
 * 3. Connecting to Neutralino via WebSocket to broadcast events
 * 4. Graceful shutdown on Neutralino close
 */

import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { createApp } from './app'
import { initPTYManager, setBroadcastDestroyed } from './terminal/pty-instance'
import {
  terminalWebSocketHandlers,
  broadcast,
  broadcastToTerminal,
} from './websocket/terminal-ws'
import { startPRMonitor, stopPRMonitor } from './services/pr-monitor'
import { startMetricsCollector, stopMetricsCollector } from './services/metrics-collector'
import { WebSocket } from 'ws'

// Neutralinojs extension connectivity info
interface NeutralinoConfig {
  nlPort: number
  nlToken: string
  nlConnectToken: string
  nlExtensionId: string
}

let neutralinoWs: WebSocket | null = null
let isShuttingDown = false

/**
 * Read Neutralinojs connectivity info from stdin.
 * Neutralino sends this as a JSON object when spawning the extension.
 */
async function readNeutralinoConfig(): Promise<NeutralinoConfig | null> {
  return new Promise((resolve) => {
    let data = ''
    const timeout = setTimeout(() => {
      // If no stdin data after 2 seconds, assume standalone mode
      console.log('[Desktop] No Neutralino config received, running in standalone mode')
      resolve(null)
    }, 2000)

    process.stdin.setEncoding('utf8')
    process.stdin.on('readable', () => {
      let chunk
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk
      }

      // Try to parse JSON
      try {
        const config = JSON.parse(data.trim())
        if (config.nlPort && config.nlToken && config.nlExtensionId) {
          clearTimeout(timeout)
          resolve(config)
        }
      } catch {
        // Not valid JSON yet, continue reading
      }
    })

    process.stdin.on('end', () => {
      clearTimeout(timeout)
      try {
        const config = JSON.parse(data.trim())
        resolve(config)
      } catch {
        resolve(null)
      }
    })
  })
}

/**
 * Connect to Neutralinojs via WebSocket
 */
function connectToNeutralino(config: NeutralinoConfig): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const wsUrl = `ws://localhost:${config.nlPort}?extensionId=${config.nlExtensionId}&connectToken=${config.nlConnectToken}`
    console.log(`[Desktop] Connecting to Neutralino at ws://localhost:${config.nlPort}`)

    const ws = new WebSocket(wsUrl)

    ws.on('open', () => {
      console.log('[Desktop] Connected to Neutralino')
      resolve(ws)
    })

    ws.on('error', (err) => {
      console.error('[Desktop] WebSocket error:', err)
      reject(err)
    })

    ws.on('close', () => {
      console.log('[Desktop] Neutralino connection closed')
      if (!isShuttingDown) {
        gracefulShutdown()
      }
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.event === 'shutdown') {
          console.log('[Desktop] Received shutdown signal')
          gracefulShutdown()
        }
      } catch {
        // Ignore malformed messages
      }
    })
  })
}

/**
 * Broadcast an event to Neutralino app
 */
function broadcastToNeutralino(event: string, data: unknown) {
  if (!neutralinoWs || neutralinoWs.readyState !== WebSocket.OPEN) {
    return
  }

  neutralinoWs.send(
    JSON.stringify({
      id: crypto.randomUUID(),
      method: 'app.broadcast',
      accessToken: (neutralinoWs as unknown as { nlToken?: string }).nlToken,
      data: { event, data },
    })
  )
}

/**
 * Find an available port
 */
async function findAvailablePort(startPort: number): Promise<number> {
  const net = await import('net')

  return new Promise((resolve, reject) => {
    const server = net.createServer()

    server.listen(startPort, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : startPort
      server.close(() => resolve(port))
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Try next port
        resolve(findAvailablePort(startPort + 1))
      } else {
        reject(err)
      }
    })
  })
}

// PTY manager reference for cleanup
let ptyManager: ReturnType<typeof initPTYManager> | null = null
let server: ReturnType<typeof serve> | null = null

/**
 * Graceful shutdown
 */
function gracefulShutdown() {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log('\n[Desktop] Shutting down (terminals will persist)...')

  stopPRMonitor()
  stopMetricsCollector()

  if (ptyManager) {
    ptyManager.detachAll()
  }

  if (server) {
    server.close()
  }

  if (neutralinoWs) {
    neutralinoWs.close()
  }

  // Give a moment for cleanup
  setTimeout(() => process.exit(0), 500)
}

/**
 * Main entry point
 */
async function main() {
  console.log('[Desktop] Starting Vibora server in desktop mode...')

  // Read Neutralino config from stdin
  const nlConfig = await readNeutralinoConfig()

  // Find an available port (prefer 3333, but find another if taken)
  const preferredPort = parseInt(process.env.PORT || '3333', 10)
  const PORT = await findAvailablePort(preferredPort)
  console.log(`[Desktop] Using port ${PORT}`)

  // Initialize PTY manager with broadcast callbacks
  ptyManager = initPTYManager({
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

  // Restore terminals from database
  ptyManager.restoreFromDatabase()

  // Set up broadcast function for terminal destruction
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
  server = serve(
    {
      fetch: app.fetch,
      port: PORT,
      hostname: '127.0.0.1', // Bind to localhost only for desktop app
    },
    async (info) => {
      console.log(`[Desktop] Vibora server running on port ${info.port}`)

      // If running as Neutralino extension, connect and broadcast ready
      if (nlConfig) {
        try {
          neutralinoWs = await connectToNeutralino(nlConfig)
          // Store token for broadcasts
          ;(neutralinoWs as unknown as { nlToken: string }).nlToken = nlConfig.nlToken

          // Broadcast that server is ready
          broadcastToNeutralino('serverReady', { port: info.port })
          console.log('[Desktop] Broadcasted serverReady event to Neutralino')
        } catch (err) {
          console.error('[Desktop] Failed to connect to Neutralino:', err)
          broadcastToNeutralino('serverError', { message: 'Failed to connect to Neutralino' })
        }
      } else {
        // Standalone mode - just print URL
        console.log(`[Desktop] Open http://localhost:${info.port} in your browser`)
      }
    }
  )

  // Inject WebSocket support
  injectWebSocket(server)

  // Start background services
  startPRMonitor()
  startMetricsCollector()

  // Handle shutdown signals
  process.on('SIGINT', gracefulShutdown)
  process.on('SIGTERM', gracefulShutdown)
}

main().catch((err) => {
  console.error('[Desktop] Fatal error:', err)
  process.exit(1)
})
