import { Hono } from 'hono'
import { readdirSync, readFileSync, readlinkSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
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

// Types for Vibora instances
interface ViboraInstanceGroup {
  viboraDir: string
  port: number
  mode: 'development' | 'production'
  backend: { pid: number; memoryMB: number; startedAt: number | null } | null
  frontend: { pid: number; memoryMB: number; startedAt: number | null } | null
  totalMemoryMB: number
}

// Get process environment variables
function getProcessEnv(pid: number): Record<string, string> {
  try {
    const environ = readFileSync(`/proc/${pid}/environ`, 'utf-8')
    const env: Record<string, string> = {}
    for (const entry of environ.split('\0')) {
      const idx = entry.indexOf('=')
      if (idx > 0) {
        env[entry.slice(0, idx)] = entry.slice(idx + 1)
      }
    }
    return env
  } catch {
    return {}
  }
}

// Get parent PID
function getParentPid(pid: number): number | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8')
    const match = stat.match(/^\d+ \([^)]+\) \S+ (\d+)/)
    return match ? parseInt(match[1], 10) : null
  } catch {
    return null
  }
}

// Find all Vibora instances (backends and frontends)
function findViboraInstances(): ViboraInstanceGroup[] {
  const backends: Array<{
    pid: number
    port: number
    viboraDir: string
    mode: 'development' | 'production'
    memoryMB: number
    startedAt: number | null
    parentPid: number | null
  }> = []

  const frontends: Array<{
    pid: number
    port: number
    memoryMB: number
    startedAt: number | null
    parentPid: number | null
    backendPort: number | null
  }> = []

  try {
    const procDirs = readdirSync('/proc').filter((d) => /^\d+$/.test(d))

    for (const pidStr of procDirs) {
      const pid = parseInt(pidStr, 10)
      try {
        const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf-8').replace(/\0/g, ' ')
        const env = getProcessEnv(pid)
        const parentPid = getParentPid(pid)

        // Check for Vibora backend
        // Dev: process starts with "bun" and has "server/index.ts" in args
        // Prod: process starts with "bun" and has VIBORA_PACKAGE_ROOT env var
        // We check the first part of cmdline to avoid shell wrappers that mention bun
        const cmdParts = cmdline.trim().split(/\s+/)
        const isBunProcess = cmdParts[0]?.includes('bun') ?? false
        const isDevBackend = isBunProcess && cmdline.includes('server/index.ts') && env.NODE_ENV !== 'production'
        const isProdBackend = isBunProcess && (!!env.VIBORA_PACKAGE_ROOT || (cmdline.includes('server/index.ts') && env.NODE_ENV === 'production'))

        if (isDevBackend || isProdBackend) {
          const port = parseInt(env.PORT || '3333', 10)
          const cwd = getProcessCwd(pid)
          // Resolve viboraDir - if relative, combine with cwd; if absolute or starts with ~, use as-is
          let viboraDir = env.VIBORA_DIR || (isDevBackend ? '~/.vibora/dev' : '~/.vibora')
          if (viboraDir.startsWith('.') && cwd !== '(unknown)') {
            // Relative path - show the cwd for clarity
            viboraDir = cwd
          }
          const mode = isDevBackend ? 'development' : 'production'

          backends.push({
            pid,
            port,
            viboraDir,
            mode,
            memoryMB: getProcessMemoryMB(pid),
            startedAt: getProcessStartTime(pid),
            parentPid,
          })
        }

        // Check for Vite frontend (potential Vibora dev frontend)
        // Look for node vite processes with VITE_BACKEND_PORT set (not shell wrappers)
        const isNodeProcess = cmdParts[0]?.includes('node') ?? false
        if (isNodeProcess && cmdline.includes('vite') && env.VITE_BACKEND_PORT) {
          const backendPort = parseInt(env.VITE_BACKEND_PORT, 10)
          // Try to find the port Vite is listening on from the cmdline or default
          const port = 5173 // Vite default, could be different if ports are in use

          frontends.push({
            pid,
            port,
            memoryMB: getProcessMemoryMB(pid),
            startedAt: getProcessStartTime(pid),
            parentPid,
            backendPort,
          })
        }
      } catch {
        // Process may have exited, skip
      }
    }
  } catch {
    // /proc not available
  }

  // Group backends with their frontends
  const groups: ViboraInstanceGroup[] = []

  for (const backend of backends) {
    // Find associated frontend: same parent (concurrently) or matching VITE_BACKEND_PORT
    const associatedFrontend = frontends.find(
      (f) =>
        f.backendPort === backend.port ||
        (f.parentPid && f.parentPid === backend.parentPid)
    )

    groups.push({
      viboraDir: backend.viboraDir,
      port: backend.port,
      mode: backend.mode,
      backend: {
        pid: backend.pid,
        memoryMB: backend.memoryMB,
        startedAt: backend.startedAt,
      },
      frontend: associatedFrontend
        ? {
            pid: associatedFrontend.pid,
            memoryMB: associatedFrontend.memoryMB,
            startedAt: associatedFrontend.startedAt,
          }
        : null,
      totalMemoryMB: backend.memoryMB + (associatedFrontend?.memoryMB || 0),
    })

    // Remove matched frontend from consideration
    if (associatedFrontend) {
      const idx = frontends.indexOf(associatedFrontend)
      if (idx >= 0) frontends.splice(idx, 1)
    }
  }

  // Sort by port
  groups.sort((a, b) => a.port - b.port)

  return groups
}

// GET /api/monitoring/vibora-instances
monitoringRoutes.get('/vibora-instances', (c) => {
  const groups = findViboraInstances()
  return c.json(groups)
})

// POST /api/monitoring/vibora-instances/:pid/kill
// Kill a Vibora instance group (backend + frontend if present)
monitoringRoutes.post('/vibora-instances/:pid/kill', async (c) => {
  const pidStr = c.req.param('pid')
  const backendPid = parseInt(pidStr, 10)

  if (isNaN(backendPid)) {
    return c.json({ error: 'Invalid PID' }, 400)
  }

  // Find this instance group
  const groups = findViboraInstances()
  const group = groups.find((g) => g.backend?.pid === backendPid)

  if (!group) {
    return c.json({ error: 'Vibora instance not found' }, 404)
  }

  const killedPids: number[] = []

  // Kill frontend first (if present), then backend
  const pidsToKill = [
    group.frontend?.pid,
    group.backend?.pid,
  ].filter((p): p is number => p !== null && p !== undefined)

  for (const pid of pidsToKill) {
    try {
      // Send SIGTERM first
      process.kill(pid, 'SIGTERM')
      killedPids.push(pid)
    } catch {
      // Process may already be gone
    }
  }

  // Wait briefly for graceful shutdown
  await new Promise((resolve) => setTimeout(resolve, 500))

  // Force kill any remaining processes
  for (const pid of pidsToKill) {
    try {
      // Check if still running
      process.kill(pid, 0)
      // Still running, force kill
      process.kill(pid, 'SIGKILL')
    } catch {
      // Process already gone
    }
  }

  return c.json({
    success: true,
    killed: killedPids,
    viboraDir: group.viboraDir,
    port: group.port,
  })
})

// Claude Code Usage Limits
interface UsageBlock {
  percentUsed: number
  resetAt: string
  isOverLimit: boolean
}

interface ClaudeUsageResponse {
  available: boolean
  fiveHour: (UsageBlock & { timeRemainingMinutes: number }) | null
  sevenDay: (UsageBlock & { weekProgressPercent: number }) | null
  sevenDayOpus: UsageBlock | null
  sevenDaySonnet: UsageBlock | null
  error?: string
}

// Cache for Claude usage data
let cachedUsage: ClaudeUsageResponse | null = null
let usageCacheTimestamp = 0
const USAGE_CACHE_MS = 15 * 1000 // 15 seconds

// Get OAuth token from Claude Code credentials
async function getClaudeOAuthToken(): Promise<string | null> {
  // Primary location: ~/.claude/.credentials.json
  const primaryPath = join(homedir(), '.claude', '.credentials.json')
  try {
    if (existsSync(primaryPath)) {
      const content = readFileSync(primaryPath, 'utf-8')
      const config = JSON.parse(content)
      if (config.claudeAiOauth && typeof config.claudeAiOauth === 'object') {
        const token = config.claudeAiOauth.accessToken
        if (token && typeof token === 'string' && token.startsWith('sk-ant-oat')) {
          return token
        }
      }
    }
  } catch {
    // File doesn't exist or is invalid
  }

  // Fallback: try secret-tool (GNOME Keyring)
  try {
    const result = execSync('secret-tool lookup service "Claude Code"', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const token = result.trim()
    if (token && token.startsWith('sk-ant-oat')) {
      return token
    }
  } catch {
    // secret-tool not available or no credential found
  }

  return null
}

// Fetch usage from Anthropic API
async function fetchClaudeUsage(token: string): Promise<ClaudeUsageResponse> {
  try {
    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'vibora/1.0.0',
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
    })

    if (!response.ok) {
      return { available: false, fiveHour: null, sevenDay: null, sevenDayOpus: null, sevenDaySonnet: null, error: `API returned ${response.status}` }
    }

    const data = await response.json() as {
      five_hour?: { resets_at?: string; utilization?: number }
      seven_day?: { resets_at?: string; utilization?: number }
      seven_day_opus?: { resets_at?: string; utilization?: number } | null
      seven_day_sonnet?: { resets_at?: string; utilization?: number } | null
    }

    const parseBlock = (block?: { resets_at?: string; utilization?: number }): UsageBlock | null => {
      if (!block) return null
      return {
        percentUsed: block.utilization ?? 0,
        resetAt: block.resets_at || new Date().toISOString(),
        isOverLimit: (block.utilization ?? 0) >= 100,
      }
    }

    const fiveHour = parseBlock(data.five_hour)
    const sevenDay = parseBlock(data.seven_day)

    // Calculate time remaining for 5-hour block
    let fiveHourWithTime: (UsageBlock & { timeRemainingMinutes: number }) | null = null
    if (fiveHour) {
      const now = new Date()
      const resetAt = new Date(fiveHour.resetAt)
      const timeRemainingMinutes = Math.max(0, Math.round((resetAt.getTime() - now.getTime()) / (1000 * 60)))
      fiveHourWithTime = { ...fiveHour, timeRemainingMinutes }
    }

    // Calculate week progress for 7-day limit
    let sevenDayWithProgress: (UsageBlock & { weekProgressPercent: number }) | null = null
    if (sevenDay) {
      const now = new Date()
      const resetAt = new Date(sevenDay.resetAt)
      const periodStart = new Date(resetAt)
      periodStart.setDate(periodStart.getDate() - 7)

      let weekProgressPercent: number
      if (now > resetAt) {
        // We're past reset, calculate from reset as new period start
        const newResetAt = new Date(resetAt)
        newResetAt.setDate(newResetAt.getDate() + 7)
        const totalMs = newResetAt.getTime() - resetAt.getTime()
        const elapsedMs = now.getTime() - resetAt.getTime()
        weekProgressPercent = Math.round((elapsedMs / totalMs) * 100)
      } else {
        const totalMs = resetAt.getTime() - periodStart.getTime()
        const elapsedMs = now.getTime() - periodStart.getTime()
        weekProgressPercent = Math.max(0, Math.min(100, Math.round((elapsedMs / totalMs) * 100)))
      }
      sevenDayWithProgress = { ...sevenDay, weekProgressPercent }
    }

    return {
      available: true,
      fiveHour: fiveHourWithTime,
      sevenDay: sevenDayWithProgress,
      sevenDayOpus: parseBlock(data.seven_day_opus ?? undefined),
      sevenDaySonnet: parseBlock(data.seven_day_sonnet ?? undefined),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { available: false, fiveHour: null, sevenDay: null, sevenDayOpus: null, sevenDaySonnet: null, error: message }
  }
}

// GET /api/monitoring/claude-usage
monitoringRoutes.get('/claude-usage', async (c) => {
  const now = Date.now()

  // Return cached data if still fresh
  if (cachedUsage && (now - usageCacheTimestamp) < USAGE_CACHE_MS) {
    return c.json(cachedUsage)
  }

  // Get OAuth token
  const token = await getClaudeOAuthToken()
  if (!token) {
    const response: ClaudeUsageResponse = {
      available: false,
      fiveHour: null,
      sevenDay: null,
      sevenDayOpus: null,
      sevenDaySonnet: null,
      error: 'No Claude Code OAuth token found',
    }
    return c.json(response)
  }

  // Fetch usage from API
  const usage = await fetchClaudeUsage(token)

  // Cache the result
  cachedUsage = usage
  usageCacheTimestamp = now

  return c.json(usage)
})
