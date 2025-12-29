import { Hono } from 'hono'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import * as os from 'node:os'
import type { ExecuteCommandRequest, ExecuteCommandResponse, ExecSession } from '@shared/types'

const DEFAULT_TIMEOUT = 30000 // 30 seconds
const SESSION_EXPIRY = 30 * 60 * 1000 // 30 minutes

// Unique markers for output parsing
const START_MARKER = `<<VIBORA_CMD_START_${randomUUID().slice(0, 8)}>>`
const END_MARKER_PREFIX = `<<VIBORA_CMD_END_${randomUUID().slice(0, 8)}:`

interface ShellSession {
  id: string
  process: ChildProcess
  cwd: string
  outputBuffer: string
  stderrBuffer: string
  pendingResolve: ((result: { stdout: string; stderr: string; exitCode: number }) => void) | null
  pendingReject: ((error: Error) => void) | null
  createdAt: Date
  lastUsedAt: Date
}

const sessions = new Map<string, ShellSession>()

// Cleanup expired sessions periodically
setInterval(() => {
  const now = Date.now()
  for (const [id, session] of sessions) {
    if (now - session.lastUsedAt.getTime() > SESSION_EXPIRY) {
      destroySession(id)
    }
  }
}, 60000) // Check every minute

function createSession(cwd?: string): ShellSession {
  const id = randomUUID()
  const initialCwd = cwd || os.homedir()

  // Use bash in non-interactive mode with no rc files
  // The shell stays alive as long as stdin isn't closed
  const proc = spawn('/bin/bash', ['--norc', '--noprofile'], {
    cwd: initialCwd,
    env: { ...process.env, TERM: 'dumb' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const session: ShellSession = {
    id,
    process: proc,
    cwd: initialCwd,
    outputBuffer: '',
    stderrBuffer: '',
    pendingResolve: null,
    pendingReject: null,
    createdAt: new Date(),
    lastUsedAt: new Date(),
  }

  proc.stdout?.on('data', (data: Buffer) => {
    session.outputBuffer += data.toString()
    checkForCompletion(session)
  })

  proc.stderr?.on('data', (data: Buffer) => {
    session.stderrBuffer += data.toString()
  })

  proc.on('error', (err) => {
    if (session.pendingReject) {
      session.pendingReject(err)
      session.pendingResolve = null
      session.pendingReject = null
    }
  })

  proc.on('exit', () => {
    sessions.delete(id)
    if (session.pendingReject) {
      session.pendingReject(new Error('Shell process exited unexpectedly'))
      session.pendingResolve = null
      session.pendingReject = null
    }
  })

  sessions.set(id, session)
  return session
}

function checkForCompletion(session: ShellSession) {
  if (!session.pendingResolve) return

  const endMarkerRegex = new RegExp(`${END_MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)>>`)
  const match = session.outputBuffer.match(endMarkerRegex)

  if (match) {
    const exitCode = parseInt(match[1], 10)
    const startIdx = session.outputBuffer.indexOf(START_MARKER)
    const endIdx = session.outputBuffer.indexOf(match[0])

    let stdout = ''
    if (startIdx !== -1 && endIdx > startIdx) {
      stdout = session.outputBuffer.slice(startIdx + START_MARKER.length + 1, endIdx)
      // Remove trailing newline from stdout
      if (stdout.endsWith('\n')) {
        stdout = stdout.slice(0, -1)
      }
    }

    const stderr = session.stderrBuffer

    // Clear buffers
    session.outputBuffer = ''
    session.stderrBuffer = ''

    const resolve = session.pendingResolve
    session.pendingResolve = null
    session.pendingReject = null
    resolve({ stdout, stderr, exitCode })
  }
}

function destroySession(id: string): boolean {
  const session = sessions.get(id)
  if (!session) return false

  try {
    session.process.kill()
  } catch {
    // Ignore kill errors
  }
  sessions.delete(id)
  return true
}

async function executeCommand(
  session: ShellSession,
  command: string,
  timeout: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    session.lastUsedAt = new Date()
    session.outputBuffer = ''
    session.stderrBuffer = ''
    session.pendingResolve = resolve
    session.pendingReject = reject

    // Wrap command with markers to capture output and exit code
    const wrappedCommand = `echo "${START_MARKER}"; ${command}; echo "${END_MARKER_PREFIX}$?>>"\n`

    const timeoutId = setTimeout(() => {
      session.pendingResolve = null
      session.pendingReject = null
      reject(new Error('Command timed out'))
    }, timeout)

    // Override resolve to clear timeout
    const originalResolve = resolve
    session.pendingResolve = (result) => {
      clearTimeout(timeoutId)
      originalResolve(result)
    }

    session.process.stdin?.write(wrappedCommand)
  })
}

async function updateSessionCwd(session: ShellSession): Promise<void> {
  try {
    const result = await executeCommand(session, 'pwd', 5000)
    if (result.exitCode === 0 && result.stdout.trim()) {
      session.cwd = result.stdout.trim()
    }
  } catch {
    // Ignore cwd update errors
  }
}

const app = new Hono()

// POST /api/exec - Execute a command
app.post('/', async (c) => {
  try {
    const body = await c.req.json<ExecuteCommandRequest>()
    const { command, sessionId, cwd, timeout = DEFAULT_TIMEOUT } = body

    if (!command) {
      return c.json({ error: 'command is required' }, 400)
    }

    // Get or create session
    let session: ShellSession
    if (sessionId) {
      const existing = sessions.get(sessionId)
      if (!existing) {
        return c.json({ error: `Session ${sessionId} not found` }, 404)
      }
      session = existing
    } else {
      session = createSession(cwd)
    }

    try {
      const result = await executeCommand(session, command, timeout)

      // Update cwd after command execution
      await updateSessionCwd(session)

      const response: ExecuteCommandResponse = {
        sessionId: session.id,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        timedOut: false,
      }

      return c.json(response)
    } catch (err) {
      if (err instanceof Error && err.message === 'Command timed out') {
        const response: ExecuteCommandResponse = {
          sessionId: session.id,
          stdout: session.outputBuffer,
          stderr: session.stderrBuffer,
          exitCode: null,
          timedOut: true,
        }
        return c.json(response)
      }
      throw err
    }
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to execute command' }, 500)
  }
})

// GET /api/exec/sessions - List active sessions
app.get('/sessions', (c) => {
  const sessionList: ExecSession[] = []
  for (const [id, session] of sessions) {
    sessionList.push({
      id,
      cwd: session.cwd,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
    })
  }
  return c.json(sessionList)
})

// DELETE /api/exec/sessions/:id - Destroy a session
app.delete('/sessions/:id', (c) => {
  const id = c.req.param('id')
  const destroyed = destroySession(id)
  if (!destroyed) {
    return c.json({ error: `Session ${id} not found` }, 404)
  }
  return c.json({ success: true })
})

export default app
