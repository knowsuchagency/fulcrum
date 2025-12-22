import { Hono } from 'hono'
import { readdirSync, readFileSync, readlinkSync } from 'fs'
import { execSync } from 'child_process'
import { db, tasks } from '../db'
import { eq } from 'drizzle-orm'
import { getPTYManager } from '../terminal/pty-instance'
import { getDtachService } from '../terminal/dtach-service'
import { getMetrics, getCurrentMetrics } from '../services/metrics-collector'

interface ClaudeInstance {
  pid: number
  cwd: string
  ramMB: number
  startedAt: number | null
  terminalId: string | null
  terminalName: string | null
  taskId: string | null
  taskTitle: string | null
  worktreePath: string | null
  isViboraManaged: boolean
}

// Parse time window string to seconds
function parseWindow(window: string): number {
  const match = window.match(/^(\d+)(m|h)$/)
  if (!match) return 3600 // Default 1 hour

  const value = parseInt(match[1], 10)
  const unit = match[2]

  if (unit === 'm') return value * 60
  if (unit === 'h') return value * 3600

  return 3600
}

// Find all Claude processes on the system
function findAllClaudeProcesses(): Array<{ pid: number; cmdline: string }> {
  const claudeProcesses: Array<{ pid: number; cmdline: string }> = []

  try {
    const procDirs = readdirSync('/proc').filter((d) => /^\d+$/.test(d))
    for (const pidStr of procDirs) {
      const pid = parseInt(pidStr, 10)
      try {
        const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf-8')
        // Check for claude process (claude, claude-code, @anthropic/claude-code, etc.)
        if (/\bclaude\b/i.test(cmdline)) {
          claudeProcesses.push({ pid, cmdline })
        }
      } catch {
        // Process may have exited, skip
      }
    }
  } catch {
    // /proc not available (non-Linux), fallback to pgrep
    try {
      const result = execSync('pgrep -f claude', { encoding: 'utf-8' })
      for (const line of result.trim().split('\n')) {
        const pid = parseInt(line, 10)
        if (!isNaN(pid)) {
          try {
            const cmdline = execSync(`ps -p ${pid} -o args=`, { encoding: 'utf-8' }).trim()
            claudeProcesses.push({ pid, cmdline })
          } catch {
            claudeProcesses.push({ pid, cmdline: 'claude' })
          }
        }
      }
    } catch {
      // No matches
    }
  }

  return claudeProcesses
}

// Get process working directory
function getProcessCwd(pid: number): string {
  try {
    return readlinkSync(`/proc/${pid}/cwd`)
  } catch {
    try {
      const result = execSync(`lsof -p ${pid} -d cwd -Fn 2>/dev/null | grep ^n | cut -c2-`, {
        encoding: 'utf-8',
      })
      return result.trim() || '(unknown)'
    } catch {
      return '(unknown)'
    }
  }
}

// Get process memory in MB (RSS)
function getProcessMemoryMB(pid: number): number {
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf-8')
    const match = status.match(/VmRSS:\s+(\d+)\s+kB/)
    return match ? parseInt(match[1], 10) / 1024 : 0
  } catch {
    try {
      const result = execSync(`ps -o rss= -p ${pid}`, { encoding: 'utf-8' })
      return parseInt(result.trim(), 10) / 1024
    } catch {
      return 0
    }
  }
}

// Get process start time
function getProcessStartTime(pid: number): number | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8')
    // Field 22 is starttime in clock ticks since boot
    const fields = stat.split(' ')
    const starttime = parseInt(fields[21], 10)

    // Get system uptime and boot time to calculate actual start time
    const uptime = parseFloat(readFileSync('/proc/uptime', 'utf-8').split(' ')[0])
    const clockTicks = 100 // Usually 100 on Linux (sysconf(_SC_CLK_TCK))
    const bootTime = Math.floor(Date.now() / 1000) - uptime

    return Math.floor(bootTime + starttime / clockTicks)
  } catch {
    return null
  }
}

// Get all descendant PIDs of a process
function getDescendantPids(pid: number): number[] {
  const descendants: number[] = []
  try {
    const result = execSync(`ps --ppid ${pid} -o pid= 2>/dev/null || true`, { encoding: 'utf-8' })
    for (const line of result.trim().split('\n')) {
      const childPid = parseInt(line.trim(), 10)
      if (!isNaN(childPid)) {
        descendants.push(childPid)
        descendants.push(...getDescendantPids(childPid))
      }
    }
  } catch {
    // Ignore errors
  }
  return descendants
}

export const monitoringRoutes = new Hono()

// GET /api/monitoring/claude-instances
monitoringRoutes.get('/claude-instances', (c) => {
  const filter = c.req.query('filter') || 'vibora'

  // Find all Claude processes on the system
  const allClaudeProcesses = findAllClaudeProcesses()

  // Get Vibora terminals and their process trees
  let viboraManagedPids = new Map<number, { terminalId: string; terminalName: string; cwd: string }>()

  try {
    const ptyManager = getPTYManager()
    const terminals = ptyManager.listTerminals()
    const dtachService = getDtachService()

    for (const terminal of terminals) {
      // Get dtach process for this terminal
      const socketPath = dtachService.getSocketPath(terminal.id)
      try {
        // Find processes using this socket
        const procDirs = readdirSync('/proc').filter((d) => /^\d+$/.test(d))
        for (const pidStr of procDirs) {
          const pid = parseInt(pidStr, 10)
          try {
            const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf-8')
            if (cmdline.includes(socketPath)) {
              // This is a dtach process for this terminal
              // Get all descendants
              const descendants = getDescendantPids(pid)
              for (const descendantPid of [...descendants, pid]) {
                viboraManagedPids.set(descendantPid, {
                  terminalId: terminal.id,
                  terminalName: terminal.name,
                  cwd: terminal.cwd,
                })
              }
            }
          } catch {
            // Skip
          }
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // PTY manager might not be initialized
  }

  // Get all tasks for matching worktree paths to tasks
  const allTasks = db.select().from(tasks).all()
  const tasksByWorktree = new Map(
    allTasks.filter((t) => t.worktreePath).map((t) => [t.worktreePath!, t])
  )

  // Build Claude instances list
  const instances: ClaudeInstance[] = []

  for (const { pid } of allClaudeProcesses) {
    const viboraInfo = viboraManagedPids.get(pid)
    const isViboraManaged = !!viboraInfo

    // Apply filter
    if (filter === 'vibora' && !isViboraManaged) {
      continue
    }

    const cwd = viboraInfo?.cwd || getProcessCwd(pid)
    const ramMB = Math.round(getProcessMemoryMB(pid) * 10) / 10
    const startedAt = getProcessStartTime(pid)

    // Find associated task
    let taskId: string | null = null
    let taskTitle: string | null = null
    let worktreePath: string | null = null

    if (viboraInfo) {
      const task = tasksByWorktree.get(viboraInfo.cwd)
      if (task) {
        taskId = task.id
        taskTitle = task.title
        worktreePath = viboraInfo.cwd
      }
    }

    instances.push({
      pid,
      cwd,
      ramMB,
      startedAt,
      terminalId: viboraInfo?.terminalId || null,
      terminalName: viboraInfo?.terminalName || null,
      taskId,
      taskTitle,
      worktreePath,
      isViboraManaged,
    })
  }

  // Sort by Vibora-managed first, then by RAM usage
  instances.sort((a, b) => {
    if (a.isViboraManaged !== b.isViboraManaged) {
      return a.isViboraManaged ? -1 : 1
    }
    return b.ramMB - a.ramMB
  })

  return c.json(instances)
})

// GET /api/monitoring/system-metrics
monitoringRoutes.get('/system-metrics', (c) => {
  const windowStr = c.req.query('window') || '1h'
  const windowSeconds = parseWindow(windowStr)

  const dataPoints = getMetrics(windowSeconds)
  const current = getCurrentMetrics()

  return c.json({
    window: windowStr,
    dataPoints,
    current,
  })
})

// POST /api/monitoring/claude-instances/:terminalId/kill
monitoringRoutes.post('/claude-instances/:terminalId/kill', (c) => {
  const terminalId = c.req.param('terminalId')

  try {
    const dtachService = getDtachService()
    const killed = dtachService.killClaudeInSession(terminalId)

    return c.json({ success: true, killed })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})

// POST /api/monitoring/claude-instances/:pid/kill-pid
// Kill a Claude process by PID (for non-Vibora managed instances)
monitoringRoutes.post('/claude-instances/:pid/kill-pid', (c) => {
  const pidStr = c.req.param('pid')
  const pid = parseInt(pidStr, 10)

  if (isNaN(pid)) {
    return c.json({ error: 'Invalid PID' }, 400)
  }

  try {
    // Verify it's actually a Claude process before killing
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf-8')
    if (!/\bclaude\b/i.test(cmdline)) {
      return c.json({ error: 'Process is not a Claude instance' }, 400)
    }

    process.kill(pid, 'SIGTERM')
    return c.json({ success: true, killed: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})
