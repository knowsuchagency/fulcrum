import { Hono } from 'hono'
import { readdirSync, readFileSync, readlinkSync } from 'fs'
import { execSync } from 'child_process'
import { db, tasks } from '../db'
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
  const viboraManagedPids = new Map<number, { terminalId: string; terminalName: string; cwd: string }>()

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

interface TopProcess {
  pid: number
  name: string
  command: string
  cpuPercent: number
  memoryMB: number
  memoryPercent: number
}

// GET /api/monitoring/top-processes
// Returns top 10 processes sorted by memory usage
monitoringRoutes.get('/top-processes', (c) => {
  const sortBy = c.req.query('sort') || 'memory' // 'memory' or 'cpu'
  const limit = parseInt(c.req.query('limit') || '10', 10)

  try {
    // Get total memory for percentage calculation
    const memTotal = parseInt(
      readFileSync('/proc/meminfo', 'utf-8')
        .match(/MemTotal:\s+(\d+)/)?.[1] || '0',
      10
    ) * 1024 // Convert kB to bytes

    const processes: TopProcess[] = []
    const procDirs = readdirSync('/proc').filter((d) => /^\d+$/.test(d))

    for (const pidStr of procDirs) {
      const pid = parseInt(pidStr, 10)
      try {
        // Read process status for memory and name
        const status = readFileSync(`/proc/${pid}/status`, 'utf-8')
        const nameMatch = status.match(/Name:\s+(.+)/)
        const rssMatch = status.match(/VmRSS:\s+(\d+)\s+kB/)

        if (!nameMatch || !rssMatch) continue

        const name = nameMatch[1].trim()
        const memoryKB = parseInt(rssMatch[1], 10)
        const memoryMB = memoryKB / 1024
        const memoryPercent = memTotal > 0 ? (memoryKB * 1024 / memTotal) * 100 : 0

        // Read cmdline for full command
        let command = ''
        try {
          command = readFileSync(`/proc/${pid}/cmdline`, 'utf-8')
            .replace(/\0/g, ' ')
            .trim()
            .slice(0, 200) // Limit length
        } catch {
          command = name
        }

        // CPU percent calculation would require tracking over time
        // For simplicity, we set cpuPercent to 0 and rely on memory sorting primarily
        // (statParts[13] and statParts[14] contain utime/stime but are cumulative, not rate)
        const cpuPercent = 0

        processes.push({
          pid,
          name,
          command,
          cpuPercent: Math.round(cpuPercent * 10) / 10,
          memoryMB: Math.round(memoryMB * 10) / 10,
          memoryPercent: Math.round(memoryPercent * 10) / 10,
        })
      } catch {
        // Process may have exited or be inaccessible
        continue
      }
    }

    // Sort by memory (default) or cpu
    if (sortBy === 'cpu') {
      processes.sort((a, b) => b.cpuPercent - a.cpuPercent)
    } else {
      processes.sort((a, b) => b.memoryMB - a.memoryMB)
    }

    // Return top N
    return c.json(processes.slice(0, limit))
  } catch {
    // Fallback to ps command if /proc parsing fails
    try {
      const sortFlag = sortBy === 'cpu' ? '-pcpu' : '-rss'
      const result = execSync(
        `ps -eo pid,comm,args,%cpu,rss --sort=${sortFlag} --no-headers | head -${limit + 1}`,
        { encoding: 'utf-8', timeout: 5000 }
      )

      const memTotal = parseInt(
        execSync('grep MemTotal /proc/meminfo', { encoding: 'utf-8' })
          .match(/(\d+)/)?.[1] || '0',
        10
      ) * 1024

      const processes: TopProcess[] = []
      for (const line of result.trim().split('\n')) {
        const match = line.match(/^\s*(\d+)\s+(\S+)\s+(.+?)\s+([\d.]+)\s+(\d+)\s*$/)
        if (match) {
          const memoryKB = parseInt(match[5], 10)
          processes.push({
            pid: parseInt(match[1], 10),
            name: match[2],
            command: match[3].trim().slice(0, 200),
            cpuPercent: parseFloat(match[4]),
            memoryMB: Math.round(memoryKB / 1024 * 10) / 10,
            memoryPercent: memTotal > 0 ? Math.round(memoryKB * 1024 / memTotal * 1000) / 10 : 0,
          })
        }
      }

      return c.json(processes)
    } catch (fallbackErr) {
      const message = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
      return c.json({ error: message }, 500)
    }
  }
})

interface ContainerStats {
  id: string
  name: string
  cpuPercent: number
  memoryMB: number
  memoryLimit: number
  memoryPercent: number
}

// GET /api/monitoring/docker-stats
// Returns Docker container resource usage
monitoringRoutes.get('/docker-stats', (c) => {
  try {
    // Try docker first, then podman
    let result: string
    let runtime = 'docker'

    try {
      result = execSync('docker stats --no-stream --format "{{json .}}"', {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch {
      try {
        result = execSync('podman stats --no-stream --format "{{json .}}"', {
          encoding: 'utf-8',
          timeout: 10000,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        runtime = 'podman'
      } catch {
        // Neither docker nor podman available
        return c.json({ containers: [], available: false, runtime: null })
      }
    }

    const containers: ContainerStats[] = []

    for (const line of result.trim().split('\n')) {
      if (!line.trim()) continue

      try {
        const data = JSON.parse(line)

        // Parse CPU percentage (e.g., "0.50%" -> 0.5)
        const cpuStr = data.CPUPerc || '0%'
        const cpuPercent = parseFloat(cpuStr.replace('%', '')) || 0

        // Parse memory usage (e.g., "100MiB / 8GiB")
        const memUsageStr = data.MemUsage || '0B / 0B'
        const [usedStr, limitStr] = memUsageStr.split(' / ')

        const parseMemory = (str: string): number => {
          const match = str.match(/([\d.]+)\s*(B|KB|KiB|MB|MiB|GB|GiB)/i)
          if (!match) return 0
          const value = parseFloat(match[1])
          const unit = match[2].toLowerCase()

          switch (unit) {
            case 'b': return value / (1024 * 1024)
            case 'kb': case 'kib': return value / 1024
            case 'mb': case 'mib': return value
            case 'gb': case 'gib': return value * 1024
            default: return value
          }
        }

        const memoryMB = parseMemory(usedStr)
        const memoryLimit = parseMemory(limitStr)

        // Parse memory percentage
        const memPercStr = data.MemPerc || '0%'
        const memoryPercent = parseFloat(memPercStr.replace('%', '')) || 0

        containers.push({
          id: (data.ID || data.Id || '').slice(0, 12),
          name: data.Name || data.Names || 'unknown',
          cpuPercent: Math.round(cpuPercent * 10) / 10,
          memoryMB: Math.round(memoryMB * 10) / 10,
          memoryLimit: Math.round(memoryLimit * 10) / 10,
          memoryPercent: Math.round(memoryPercent * 10) / 10,
        })
      } catch {
        // Skip malformed JSON lines
        continue
      }
    }

    // Sort by memory usage descending
    containers.sort((a, b) => b.memoryMB - a.memoryMB)

    return c.json({ containers, available: true, runtime })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})
