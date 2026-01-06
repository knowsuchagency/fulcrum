import { execSync } from 'node:child_process'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'
import { log } from '../lib/logger'
import type { JobScope, JobState, SystemdTimer, SystemdTimerDetail, JobLogEntry } from '../../shared/types'

// Plist directories to scan
const USER_LAUNCH_AGENTS = join(homedir(), 'Library/LaunchAgents')
const GLOBAL_LAUNCH_AGENTS = '/Library/LaunchAgents'
const GLOBAL_LAUNCH_DAEMONS = '/Library/LaunchDaemons'

// Cache the launchd availability check
let launchdAvailable: boolean | null = null

// Check if launchd is available on this platform
export function isLaunchdAvailable(): boolean {
  if (launchdAvailable !== null) {
    return launchdAvailable
  }

  // Only available on macOS
  if (platform() !== 'darwin') {
    launchdAvailable = false
    return false
  }

  // Check if launchctl exists and is functional
  try {
    execSync('launchctl version', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    launchdAvailable = true
    return true
  } catch {
    launchdAvailable = false
    return false
  }
}

// Plist structure types
interface CalendarInterval {
  Month?: number
  Day?: number
  Weekday?: number
  Hour?: number
  Minute?: number
}

interface LaunchdPlist {
  Label: string
  ProgramArguments?: string[]
  Program?: string
  StartCalendarInterval?: CalendarInterval | CalendarInterval[]
  StartInterval?: number
  RunAtLoad?: boolean
  KeepAlive?: boolean | { SuccessfulExit?: boolean; NetworkState?: boolean }
  WorkingDirectory?: string
  Disabled?: boolean
  StandardOutPath?: string
  StandardErrorPath?: string
}

// Parse a plist file to JSON using plutil
function parsePlist(plistPath: string): LaunchdPlist | null {
  try {
    const json = execSync(`plutil -convert json -o - "${plistPath}"`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return JSON.parse(json)
  } catch (err) {
    log.jobs.debug('Failed to parse plist', { plistPath, error: String(err) })
    return null
  }
}

// Parse launchctl list output to get job status
interface LaunchctlListEntry {
  pid: number | null
  status: number
  label: string
}

function parseLaunchctlList(): Map<string, LaunchctlListEntry> {
  const entries = new Map<string, LaunchctlListEntry>()

  try {
    const output = execSync('launchctl list', {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    for (const line of output.split('\n').slice(1)) {
      // Skip header
      const parts = line.trim().split(/\s+/)
      if (parts.length >= 3) {
        const [pidStr, statusStr, ...labelParts] = parts
        const label = labelParts.join(' ')
        if (label) {
          entries.set(label, {
            pid: pidStr === '-' ? null : parseInt(pidStr, 10),
            status: parseInt(statusStr, 10) || 0,
            label,
          })
        }
      }
    }
  } catch (err) {
    log.jobs.error('Failed to run launchctl list', { error: String(err) })
  }

  return entries
}

// Format calendar interval to human-readable string
function formatCalendarInterval(ci: CalendarInterval): string {
  const parts: string[] = []

  if (ci.Weekday !== undefined) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    parts.push(days[ci.Weekday] || `Weekday ${ci.Weekday}`)
  }

  if (ci.Month !== undefined) {
    const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    parts.push(months[ci.Month] || `Month ${ci.Month}`)
  }

  if (ci.Day !== undefined) {
    parts.push(`Day ${ci.Day}`)
  }

  const hour = ci.Hour ?? 0
  const minute = ci.Minute ?? 0
  const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`

  if (parts.length === 0) {
    return `Daily at ${time}`
  }

  return `${parts.join(' ')} at ${time}`
}

// Format schedule from plist
function formatSchedule(plist: LaunchdPlist): string | null {
  if (plist.StartCalendarInterval) {
    const intervals = Array.isArray(plist.StartCalendarInterval)
      ? plist.StartCalendarInterval
      : [plist.StartCalendarInterval]

    if (intervals.length === 1) {
      return formatCalendarInterval(intervals[0])
    }
    return `${intervals.length} schedules`
  }

  if (plist.StartInterval) {
    const secs = plist.StartInterval
    if (secs < 60) return `Every ${secs}s`
    if (secs < 3600) return `Every ${Math.round(secs / 60)}m`
    if (secs < 86400) return `Every ${Math.round(secs / 3600)}h`
    return `Every ${Math.round(secs / 86400)}d`
  }

  if (plist.KeepAlive) return 'KeepAlive'
  if (plist.RunAtLoad) return 'RunAtLoad'

  return null
}

// Calculate next run time from schedule
function calculateNextRun(plist: LaunchdPlist): string | null {
  if (!plist.StartCalendarInterval && !plist.StartInterval) {
    return null
  }

  const now = new Date()

  if (plist.StartInterval) {
    // For interval-based jobs, estimate next run
    const nextRun = new Date(now.getTime() + plist.StartInterval * 1000)
    return nextRun.toISOString()
  }

  if (plist.StartCalendarInterval) {
    const intervals = Array.isArray(plist.StartCalendarInterval)
      ? plist.StartCalendarInterval
      : [plist.StartCalendarInterval]

    // Find the next occurrence
    let nextRun: Date | null = null

    for (const ci of intervals) {
      const candidate = new Date(now)

      // Set time
      candidate.setHours(ci.Hour ?? 0)
      candidate.setMinutes(ci.Minute ?? 0)
      candidate.setSeconds(0)
      candidate.setMilliseconds(0)

      // If in the past, move to next occurrence
      if (candidate <= now) {
        if (ci.Weekday !== undefined) {
          // Move to next week
          candidate.setDate(candidate.getDate() + 7)
        } else if (ci.Day !== undefined) {
          // Move to next month
          candidate.setMonth(candidate.getMonth() + 1)
        } else {
          // Move to tomorrow
          candidate.setDate(candidate.getDate() + 1)
        }
      }

      if (!nextRun || candidate < nextRun) {
        nextRun = candidate
      }
    }

    return nextRun?.toISOString() ?? null
  }

  return null
}

// Get command from plist
function getCommand(plist: LaunchdPlist): string | null {
  if (plist.ProgramArguments && plist.ProgramArguments.length > 0) {
    return plist.ProgramArguments.join(' ')
  }
  if (plist.Program) {
    return plist.Program
  }
  return null
}

// Determine job state from launchctl list entry
function getJobState(entry: LaunchctlListEntry | undefined, plist: LaunchdPlist): JobState {
  if (!entry) {
    return 'inactive' // Not loaded
  }

  if (entry.pid !== null && entry.pid > 0) {
    return 'active' // Currently running
  }

  if (entry.status !== 0) {
    return 'failed' // Last run failed
  }

  return 'waiting' // Loaded but not running
}

// Get last result from status code
function getLastResult(entry: LaunchctlListEntry | undefined): 'success' | 'failed' | 'unknown' | null {
  if (!entry) {
    return null
  }

  if (entry.status === 0) {
    return 'success'
  }

  if (entry.status !== 0) {
    return 'failed'
  }

  return 'unknown'
}

// Scan a directory for plist files
function scanPlistDirectory(dir: string, scope: JobScope): { path: string; scope: JobScope }[] {
  const results: { path: string; scope: JobScope }[] = []

  if (!existsSync(dir)) {
    return results
  }

  try {
    const files = readdirSync(dir)
    for (const file of files) {
      if (file.endsWith('.plist')) {
        results.push({ path: join(dir, file), scope })
      }
    }
  } catch (err) {
    log.jobs.debug('Failed to scan directory', { dir, error: String(err) })
  }

  return results
}

// List all launchd jobs
export function listJobs(scope: 'all' | 'user' | 'system' = 'all'): SystemdTimer[] {
  const jobs: SystemdTimer[] = []
  const launchctlStatus = parseLaunchctlList()

  // Collect plist files to scan
  const plistFiles: { path: string; scope: JobScope }[] = []

  if (scope === 'all' || scope === 'user') {
    plistFiles.push(...scanPlistDirectory(USER_LAUNCH_AGENTS, 'user'))
  }

  if (scope === 'all' || scope === 'system') {
    plistFiles.push(...scanPlistDirectory(GLOBAL_LAUNCH_AGENTS, 'system'))
    plistFiles.push(...scanPlistDirectory(GLOBAL_LAUNCH_DAEMONS, 'system'))
  }

  for (const { path, scope: jobScope } of plistFiles) {
    const plist = parsePlist(path)
    if (!plist || !plist.Label) {
      continue
    }

    const entry = launchctlStatus.get(plist.Label)
    const state = getJobState(entry, plist)
    const enabled = entry !== undefined && !plist.Disabled

    jobs.push({
      name: plist.Label,
      scope: jobScope,
      description: null, // launchd doesn't have descriptions
      state,
      enabled,
      nextRun: calculateNextRun(plist),
      lastRun: null, // launchd doesn't track last run time
      lastResult: getLastResult(entry),
      schedule: formatSchedule(plist),
      serviceName: plist.Label,
      unitPath: path,
    })
  }

  // Sort by scope (user first), then by name
  jobs.sort((a, b) => {
    if (a.scope !== b.scope) {
      return a.scope === 'user' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })

  return jobs
}

// Get detailed job information
export function getJob(name: string, scope: JobScope): SystemdTimerDetail | null {
  // Find the plist file
  const directories =
    scope === 'user'
      ? [USER_LAUNCH_AGENTS]
      : [GLOBAL_LAUNCH_AGENTS, GLOBAL_LAUNCH_DAEMONS]

  let plistPath: string | null = null
  let plist: LaunchdPlist | null = null

  for (const dir of directories) {
    // Try to find by exact filename
    const candidates = [
      join(dir, `${name}.plist`),
      // Also try without any prefix patterns
    ]

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        const parsed = parsePlist(candidate)
        if (parsed?.Label === name) {
          plistPath = candidate
          plist = parsed
          break
        }
      }
    }

    if (plist) break

    // Scan directory and find by label
    if (existsSync(dir)) {
      try {
        const files = readdirSync(dir)
        for (const file of files) {
          if (file.endsWith('.plist')) {
            const path = join(dir, file)
            const parsed = parsePlist(path)
            if (parsed?.Label === name) {
              plistPath = path
              plist = parsed
              break
            }
          }
        }
      } catch {
        // Ignore scan errors
      }
    }

    if (plist) break
  }

  if (!plist || !plistPath) {
    return null
  }

  const launchctlStatus = parseLaunchctlList()
  const entry = launchctlStatus.get(name)
  const state = getJobState(entry, plist)
  const enabled = entry !== undefined && !plist.Disabled

  // Read plist content as string for display
  let plistContent: string | null = null
  try {
    plistContent = execSync(`cat "${plistPath}"`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch {
    // Content not available
  }

  return {
    name,
    scope,
    description: null,
    state,
    enabled,
    nextRun: calculateNextRun(plist),
    lastRun: null,
    lastResult: getLastResult(entry),
    schedule: formatSchedule(plist),
    serviceName: name,
    unitPath: plistPath,
    timerContent: plistContent, // Plist XML content
    serviceContent: null, // No separate service file in launchd
    command: getCommand(plist),
    workingDirectory: plist.WorkingDirectory ?? null,
    lastRunStart: null,
    lastRunEnd: null,
    lastRunDurationMs: null,
    lastRunCpuTimeMs: null,
  }
}

// Get logs for a launchd job using macOS unified logging
export function getJobLogs(name: string, scope: JobScope, lines: number = 100): JobLogEntry[] {
  const job = getJob(name, scope)
  if (!job) {
    return []
  }

  // Get process name from command
  let processName = name
  if (job.command) {
    // Extract the executable name from the command
    const parts = job.command.split(/\s+/)
    if (parts.length > 0) {
      const executable = parts[0]
      processName = executable.split('/').pop() || name
    }
  }

  try {
    // Use macOS unified logging with predicate
    // Note: This requires appropriate permissions and may not work for all processes
    const cmd = `log show --predicate 'process == "${processName}" OR subsystem == "${name}"' --last 1h --style json 2>/dev/null | head -${lines * 20}`

    const output = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024, // 10MB
    })

    const entries: JobLogEntry[] = []

    // Parse JSON log entries (one per line in syslog style, or array)
    try {
      // Try parsing as array first
      const parsed = JSON.parse(output)
      if (Array.isArray(parsed)) {
        for (const entry of parsed.slice(-lines)) {
          entries.push({
            timestamp: entry.timestamp || new Date().toISOString(),
            message: entry.eventMessage || entry.message || '',
            priority: mapLogLevel(entry.messageType),
          })
        }
      }
    } catch {
      // Try parsing line by line
      for (const line of output.split('\n')) {
        if (!line.trim()) continue
        try {
          const entry = JSON.parse(line)
          entries.push({
            timestamp: entry.timestamp || new Date().toISOString(),
            message: entry.eventMessage || entry.message || '',
            priority: mapLogLevel(entry.messageType),
          })
        } catch {
          // Skip unparseable lines
        }
      }
    }

    return entries.slice(-lines)
  } catch (err) {
    log.jobs.debug('Failed to get job logs', { name, error: String(err) })

    // Fallback: try to read stdout/stderr files if configured
    const job = getJob(name, scope)
    if (job) {
      // Could add logic here to read StandardOutPath/StandardErrorPath
    }

    return []
  }
}

// Map macOS log messageType to our priority levels
function mapLogLevel(messageType: string | undefined): 'info' | 'warning' | 'error' {
  switch (messageType) {
    case 'Error':
    case 'Fault':
      return 'error'
    case 'Warning':
      return 'warning'
    default:
      return 'info'
  }
}
