import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { initPTYManager, getPTYManager, setBroadcastDestroyed } from './terminal/pty-instance'
import type { ClientMessage, ServerMessage } from './types'
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  bulkDeleteTasks,
} from './api/tasks'
import { listDirectory, listBranches } from './api/filesystem'
import { createWorktree, deleteWorktree, getDiff, getStatus } from './api/git'
import { getConfig, setConfig, deleteConfig } from './api/config'

const PORT = parseInt(process.env.PORT || '3001', 10)

interface ClientData {
  id: string
  attachedTerminals: Set<string>
}

const clients = new Map<WebSocket, ClientData>()

function broadcast(message: ServerMessage): void {
  const json = JSON.stringify(message)
  for (const ws of clients.keys()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(json)
    }
  }
}

function broadcastToTerminal(terminalId: string, message: ServerMessage): void {
  const json = JSON.stringify(message)
  for (const [ws, data] of clients.entries()) {
    if (ws.readyState === WebSocket.OPEN && data.attachedTerminals.has(terminalId)) {
      ws.send(json)
    }
  }
}

function sendTo(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
  }
}

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

const server = createServer((req, res) => {
  // Enable CORS for development
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  const path = url.pathname
  const method = req.method || 'GET'

  // Health check
  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }

  // Task API routes
  if (path === '/api/tasks' && method === 'GET') {
    return listTasks(req, res)
  }
  if (path === '/api/tasks' && method === 'POST') {
    return createTask(req, res)
  }

  // Bulk delete (must be before :id route)
  if (path === '/api/tasks/bulk' && method === 'DELETE') {
    return bulkDeleteTasks(req, res)
  }

  // Task by ID routes
  const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/)
  if (taskMatch) {
    const taskId = taskMatch[1]
    if (method === 'GET') return getTask(req, res, taskId)
    if (method === 'PATCH') return updateTask(req, res, taskId)
    if (method === 'DELETE') return deleteTask(req, res, taskId)
  }

  // Task status update route
  const statusMatch = path.match(/^\/api\/tasks\/([^/]+)\/status$/)
  if (statusMatch && method === 'PATCH') {
    return updateTaskStatus(req, res, statusMatch[1])
  }

  // Filesystem API routes
  if (path === '/api/fs/list' && method === 'GET') {
    return listDirectory(req, res)
  }

  // Git API routes
  if (path === '/api/git/branches' && method === 'GET') {
    return listBranches(req, res)
  }
  if (path === '/api/git/worktree' && method === 'POST') {
    return createWorktree(req, res)
  }
  if (path === '/api/git/worktree' && method === 'DELETE') {
    return deleteWorktree(req, res)
  }
  if (path === '/api/git/diff' && method === 'GET') {
    return getDiff(req, res)
  }
  if (path === '/api/git/status' && method === 'GET') {
    return getStatus(req, res)
  }

  // Config API routes
  const configMatch = path.match(/^\/api\/config\/([^/]+)$/)
  if (configMatch) {
    const key = configMatch[1]
    if (method === 'GET') return getConfig(req, res, key)
    if (method === 'PUT') return setConfig(req, res, key)
    if (method === 'DELETE') return deleteConfig(req, res, key)
  }

  // Not found
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not Found' }))
})

const wss = new WebSocketServer({ server, path: '/ws/terminal' })

wss.on('connection', (ws) => {
  const clientData: ClientData = {
    id: crypto.randomUUID(),
    attachedTerminals: new Set(),
  }
  clients.set(ws, clientData)
  console.log(`Client connected (${clients.size} total)`)

  // Send list of existing terminals
  const terminals = ptyManager.listTerminals()
  sendTo(ws, {
    type: 'terminals:list',
    payload: { terminals },
  })

  ws.on('message', (rawMessage) => {
    try {
      const message: ClientMessage = JSON.parse(rawMessage.toString())

      switch (message.type) {
        case 'terminal:create': {
          const { name, cols, rows, cwd } = message.payload

          // Prevent duplicate terminals for same cwd
          if (cwd) {
            const existing = ptyManager.listTerminals().find((t) => t.cwd === cwd)
            if (existing) {
              // Return existing terminal instead of creating duplicate
              clientData.attachedTerminals.add(existing.id)
              sendTo(ws, {
                type: 'terminal:created',
                payload: { terminal: existing },
              })
              break
            }
          }

          const terminal = ptyManager.create({ name, cols, rows, cwd })
          clientData.attachedTerminals.add(terminal.id)
          broadcast({
            type: 'terminal:created',
            payload: { terminal },
          })
          break
        }

        case 'terminal:destroy': {
          ptyManager.destroy(message.payload.terminalId)
          break
        }

        case 'terminal:input': {
          ptyManager.write(message.payload.terminalId, message.payload.data)
          break
        }

        case 'terminal:resize': {
          ptyManager.resize(message.payload.terminalId, message.payload.cols, message.payload.rows)
          break
        }

        case 'terminal:attach': {
          const buffer = ptyManager.getBuffer(message.payload.terminalId)
          if (buffer !== null) {
            clientData.attachedTerminals.add(message.payload.terminalId)
            sendTo(ws, {
              type: 'terminal:attached',
              payload: {
                terminalId: message.payload.terminalId,
                buffer,
              },
            })
          }
          break
        }

        case 'terminals:list': {
          sendTo(ws, {
            type: 'terminals:list',
            payload: { terminals: ptyManager.listTerminals() },
          })
          break
        }

        case 'terminal:rename': {
          const success = ptyManager.rename(
            message.payload.terminalId,
            message.payload.name
          )
          if (success) {
            broadcast({
              type: 'terminal:renamed',
              payload: {
                terminalId: message.payload.terminalId,
                name: message.payload.name,
              },
            })
          }
          break
        }
      }
    } catch (error) {
      console.error('Failed to handle message:', error)
    }
  })

  ws.on('close', () => {
    clients.delete(ws)
    console.log(`Client disconnected (${clients.size} remaining)`)
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Vibora server running on port ${PORT}`)
  console.log(`  Health check: http://localhost:${PORT}/health`)
  console.log(`  API:          http://localhost:${PORT}/api/tasks`)
  console.log(`  WebSocket:    ws://localhost:${PORT}/ws/terminal`)
})

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
