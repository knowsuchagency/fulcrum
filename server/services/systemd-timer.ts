import { execSync } from 'node:child_process'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs'
import { log } from '../lib/logger'
import type {
  JobScope,
  JobState,
  SystemdTimer,
  SystemdTimerDetail,
  CreateTimerRequest,
  UpdateTimerRequest,
  JobLogEntry,
} from '../../shared/types'

const USER_UNIT_DIR = join(homedir(), '.config/systemd/user')

// Cache the systemd availability check
let systemdAvailable: boolean | null = null

// Check if systemd is available on this platform
export function isSystemdAvailable(): boolean {
  if (systemdAvailable !== null) {
    return systemdAvailable
  }

  // Not available on non-Linux platforms
  if (platform() !== 'linux') {
    systemdAvailable = false
    return false
  }

  // Check if systemctl exists and is functional
  try {
    execSync('systemctl --version', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    systemdAvailable = true
    return true
  } catch {
    systemdAvailable = false
    return false
  }
}

// Ensure user systemd directory exists
function ensureUserUnitDir(): void {
  if (!existsSync(USER_UNIT_DIR)) {
    mkdirSync(USER_UNIT_DIR, { recursive: true })
  }
}

// Execute a systemctl command
function systemctl(args: string[], scope: JobScope = 'user'): string {
  const scopeFlag = scope === 'user' ? '--user' : ''
  const cmd = `systemctl ${scopeFlag} ${args.join(' ')}`.trim()
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string }
    log.jobs.debug('systemctl command failed', { cmd, error: error.stderr || error.message })
    throw err
  }
}

// Parse timer state from ActiveState
function parseState(activeState: string): JobState {
  switch (activeState) {
    case 'active':
      return 'active'
    case 'inactive':
      return 'inactive'
    case 'failed':
      return 'failed'
    default:
      return 'waiting'
  }
}

// Parse timestamp from systemd format to ISO string
// systemd can return either:
// - Microseconds since epoch (for NextElapseUSecRealtime)
// - Human-readable format like "Sat 2026-01-03 03:00:36 UTC" (for LastTriggerUSec)
function parseTimestamp(value: string | null): string | null {
  if (!value || value === '0' || value === 'n/a') return null
  try {
    // First try parsing as microseconds (pure numeric)
    if (/^\d+$/.test(value)) {
      const ms = parseInt(value, 10) / 1000
      if (isNaN(ms) || ms <= 0) return null
      return new Date(ms).toISOString()
    }

    // Try parsing as human-readable date string
    const date = new Date(value)
    if (isNaN(date.getTime())) return null
    return date.toISOString()
  } catch {
    return null
  }
}

// Get timer properties using systemctl show
function getTimerProperties(
  name: string,
  scope: JobScope
): {
  description: string | null
  state: JobState
  enabled: boolean
  nextRun: string | null
  lastRun: string | null
  schedule: string | null
  serviceName: string
} {
  try {
    const output = systemctl(
      [
        'show',
        name,
        '--property=Description,ActiveState,UnitFileState,NextElapseUSecRealtime,LastTriggerUSec,TimersCalendar,TimersMonotonic,Unit',
      ],
      scope
    )

    const props: Record<string, string> = {}
    for (const line of output.split('\n')) {
      const [key, ...valueParts] = line.split('=')
      if (key) {
        const value = valueParts.join('=')
        // Some properties (like TimersMonotonic) can appear multiple times
        if (props[key]) {
          props[key] += '\n' + value
        } else {
          props[key] = value
        }
      }
    }

    // Extract schedule from TimersCalendar (format: "OnCalendar={ when=... }")
    let schedule: string | null = null
    if (props['TimersCalendar']) {
      const match = props['TimersCalendar'].match(/OnCalendar=\{ when=([^;]+)/)
      if (match) {
        schedule = match[1]
      } else {
        // Try to parse simple format
        const simpleMatch = props['TimersCalendar'].match(/OnCalendar=(.+)/)
        if (simpleMatch) {
          schedule = simpleMatch[1]
        }
      }
    }

    // If no calendar schedule, try TimersMonotonic (e.g., OnStartupSec, OnUnitActiveSec)
    if (!schedule && props['TimersMonotonic']) {
      // Format: "{ OnUnitActiveUSec=1d ; next_elapse=... }" or multiple lines
      const schedules: string[] = []
      // Match OnXxxUSec=value patterns
      const monotonicMatches = props['TimersMonotonic'].matchAll(/On(\w+)USec=([^;}\s]+)/g)
      for (const m of monotonicMatches) {
        const timerType = m[1] // e.g., "Startup", "UnitActive"
        const value = m[2] // e.g., "5min", "1d"
        schedules.push(`On${timerType}Sec=${value}`)
      }
      if (schedules.length > 0) {
        schedule = schedules.join(', ')
      }
    }

    // Get service name from Unit property or derive from timer name
    let serviceName = props['Unit'] || ''
    if (!serviceName && name.endsWith('.timer')) {
      serviceName = name.replace('.timer', '.service')
    }

    return {
      description: props['Description'] || null,
      state: parseState(props['ActiveState'] || 'inactive'),
      enabled: props['UnitFileState'] === 'enabled',
      nextRun: parseTimestamp(props['NextElapseUSecRealtime']),
      lastRun: parseTimestamp(props['LastTriggerUSec']),
      schedule,
      serviceName,
    }
  } catch (err) {
    log.jobs.error('Failed to get timer properties', { name, scope, error: String(err) })
    return {
      description: null,
      state: 'inactive',
      enabled: false,
      nextRun: null,
      lastRun: null,
      schedule: null,
      serviceName: name.replace('.timer', '.service'),
    }
  }
}

// Get unit file path
function getUnitPath(name: string, scope: JobScope): string | null {
  try {
    const output = systemctl(['show', name, '--property=FragmentPath'], scope)
    const match = output.match(/FragmentPath=(.+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

// Get last execution result from service
function getLastResult(serviceName: string, scope: JobScope): 'success' | 'failed' | 'unknown' | null {
  try {
    const output = systemctl(['show', serviceName, '--property=Result,ExecMainStatus'], scope)
    const props: Record<string, string> = {}
    for (const line of output.split('\n')) {
      const [key, value] = line.split('=')
      if (key && value) {
        props[key] = value
      }
    }

    if (props['Result'] === 'success' || props['ExecMainStatus'] === '0') {
      return 'success'
    } else if (props['Result'] === 'exit-code' || (props['ExecMainStatus'] && props['ExecMainStatus'] !== '0')) {
      return 'failed'
    }
    return 'unknown'
  } catch {
    return null
  }
}

// List all timers
export function listTimers(scope: 'all' | 'user' | 'system' = 'all'): SystemdTimer[] {
  const timers: SystemdTimer[] = []

  const scopes: JobScope[] = scope === 'all' ? ['user', 'system'] : [scope]

  for (const s of scopes) {
    try {
      // Get list of timer units
      const output = systemctl(['list-timers', '--all', '--no-legend', '--no-pager'], s)

      for (const line of output.split('\n')) {
        if (!line.trim()) continue

        // Extract the timer name using regex to handle variable spacing
        // The PASSED column may contain "-" which can be adjacent to the timer name
        const timerMatch = line.match(/([a-zA-Z0-9_@-]+\.timer)/)
        if (!timerMatch) continue
        const timerName = timerMatch[1]

        const props = getTimerProperties(timerName, s)
        const unitPath = getUnitPath(timerName, s)
        const lastResult = props.lastRun ? getLastResult(props.serviceName, s) : null

        timers.push({
          name: timerName,
          scope: s,
          description: props.description,
          state: props.state,
          enabled: props.enabled,
          nextRun: props.nextRun,
          lastRun: props.lastRun,
          lastResult,
          schedule: props.schedule,
          serviceName: props.serviceName,
          unitPath,
        })
      }
    } catch (err) {
      log.jobs.error('Failed to list timers', { scope: s, error: String(err) })
    }
  }

  // Sort by scope (user first), then by name
  timers.sort((a, b) => {
    if (a.scope !== b.scope) {
      return a.scope === 'user' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })

  return timers
}

// Get timer details including unit file contents
export function getTimer(name: string, scope: JobScope): SystemdTimerDetail | null {
  const props = getTimerProperties(name, scope)
  const unitPath = getUnitPath(name, scope)
  const lastResult = props.lastRun ? getLastResult(props.serviceName, scope) : null

  // Read unit file contents and command info
  let timerContent: string | null = null
  let serviceContent: string | null = null
  let command: string | null = null
  let workingDirectory: string | null = null

  if (scope === 'user' && unitPath) {
    // For user timers, read the unit files directly
    try {
      timerContent = readFileSync(unitPath, 'utf-8')
    } catch {
      // File may not be readable
    }

    // Try to read associated service file
    const servicePath = unitPath.replace('.timer', '.service')
    try {
      serviceContent = readFileSync(servicePath, 'utf-8')

      // Parse ExecStart and WorkingDirectory from service content
      const execMatch = serviceContent.match(/^ExecStart=(.+)$/m)
      if (execMatch) {
        command = execMatch[1]
      }

      const wdMatch = serviceContent.match(/^WorkingDirectory=(.+)$/m)
      if (wdMatch) {
        workingDirectory = wdMatch[1]
      }
    } catch {
      // Service file may not exist
    }
  }

  // For system timers (or if user timer files weren't readable), get command from systemctl show
  if (!command && props.serviceName) {
    try {
      const output = systemctl(['show', props.serviceName, '--property=ExecStart,WorkingDirectory'], scope)
      for (const line of output.split('\n')) {
        if (line.startsWith('ExecStart=')) {
          const value = line.slice('ExecStart='.length)
          // ExecStart can be in format: { path=/path/to/cmd ; argv[]=/path/to/cmd arg1 arg2 ; ... }
          const pathMatch = value.match(/path=([^;]+)/)
          if (pathMatch) {
            command = pathMatch[1].trim()
          } else if (value && value !== '{}') {
            // Simple format without braces
            command = value
          }
        } else if (line.startsWith('WorkingDirectory=') && !workingDirectory) {
          const value = line.slice('WorkingDirectory='.length)
          if (value && value !== '~') {
            workingDirectory = value
          }
        }
      }
    } catch {
      // Command info not available
    }
  }

  // Get execution stats from the service
  let lastRunStart: string | null = null
  let lastRunEnd: string | null = null
  let lastRunDurationMs: number | null = null
  let lastRunCpuTimeMs: number | null = null

  if (props.serviceName) {
    try {
      const output = systemctl(
        ['show', props.serviceName, '--property=ExecMainStartTimestamp,ExecMainExitTimestamp,CPUUsageNSec'],
        scope
      )
      const statsProps: Record<string, string> = {}
      for (const line of output.split('\n')) {
        const [key, ...valueParts] = line.split('=')
        if (key) {
          statsProps[key] = valueParts.join('=')
        }
      }

      // Parse timestamps
      if (statsProps['ExecMainStartTimestamp'] && statsProps['ExecMainStartTimestamp'] !== '') {
        const startDate = new Date(statsProps['ExecMainStartTimestamp'])
        if (!isNaN(startDate.getTime())) {
          lastRunStart = startDate.toISOString()
        }
      }

      if (statsProps['ExecMainExitTimestamp'] && statsProps['ExecMainExitTimestamp'] !== '') {
        const endDate = new Date(statsProps['ExecMainExitTimestamp'])
        if (!isNaN(endDate.getTime())) {
          lastRunEnd = endDate.toISOString()
        }
      }

      // Calculate duration
      if (lastRunStart && lastRunEnd) {
        lastRunDurationMs = new Date(lastRunEnd).getTime() - new Date(lastRunStart).getTime()
      }

      // Parse CPU time (nanoseconds to milliseconds)
      if (statsProps['CPUUsageNSec'] && statsProps['CPUUsageNSec'] !== '[not set]') {
        const nsec = parseInt(statsProps['CPUUsageNSec'], 10)
        if (!isNaN(nsec) && nsec > 0) {
          lastRunCpuTimeMs = Math.round(nsec / 1_000_000)
        }
      }
    } catch {
      // Stats not available
    }
  }

  return {
    name,
    scope,
    description: props.description,
    state: props.state,
    enabled: props.enabled,
    nextRun: props.nextRun,
    lastRun: props.lastRun,
    lastResult,
    schedule: props.schedule,
    serviceName: props.serviceName,
    unitPath,
    timerContent,
    serviceContent,
    command,
    workingDirectory,
    lastRunStart,
    lastRunEnd,
    lastRunDurationMs,
    lastRunCpuTimeMs,
  }
}

// Get logs for a timer's service
export function getTimerLogs(name: string, scope: JobScope, lines: number = 100): JobLogEntry[] {
  const serviceName = name.replace('.timer', '.service')
  const scopeFlag = scope === 'user' ? '--user' : ''

  try {
    const cmd = `journalctl ${scopeFlag} -u ${serviceName} -n ${lines} --no-pager -o json`.trim()
    const output = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const entries: JobLogEntry[] = []

    for (const line of output.split('\n')) {
      if (!line.trim()) continue
      try {
        const entry = JSON.parse(line)
        const timestamp = entry.__REALTIME_TIMESTAMP
          ? new Date(parseInt(entry.__REALTIME_TIMESTAMP, 10) / 1000).toISOString()
          : new Date().toISOString()

        let priority: 'info' | 'warning' | 'error' = 'info'
        const prio = parseInt(entry.PRIORITY, 10)
        if (prio <= 3) {
          priority = 'error'
        } else if (prio <= 4) {
          priority = 'warning'
        }

        entries.push({
          timestamp,
          message: entry.MESSAGE || '',
          priority,
        })
      } catch {
        // Skip unparseable lines
      }
    }

    return entries
  } catch (err) {
    log.jobs.error('Failed to get timer logs', { name, scope, error: String(err) })
    return []
  }
}

// Enable or disable a timer
export function enableTimer(name: string, scope: JobScope, enable: boolean): void {
  if (scope === 'system') {
    throw new Error('Cannot modify system timers')
  }

  const action = enable ? 'enable' : 'disable'
  systemctl([action, name], scope)
  log.jobs.info(`Timer ${action}d`, { name })
}

// Start a timer
export function startTimer(name: string, scope: JobScope): void {
  if (scope === 'system') {
    throw new Error('Cannot modify system timers')
  }

  systemctl(['start', name], scope)
  log.jobs.info('Timer started', { name })
}

// Stop a timer
export function stopTimer(name: string, scope: JobScope): void {
  if (scope === 'system') {
    throw new Error('Cannot modify system timers')
  }

  systemctl(['stop', name], scope)
  log.jobs.info('Timer stopped', { name })
}

// Run the associated service immediately
export function runNow(name: string, scope: JobScope): void {
  const serviceName = name.replace('.timer', '.service')
  systemctl(['start', serviceName], scope)
  log.jobs.info('Service triggered', { name, serviceName })
}

// Create a new user timer
export function createTimer(config: CreateTimerRequest): void {
  ensureUserUnitDir()

  const timerName = config.name.endsWith('.timer') ? config.name : `${config.name}.timer`
  const serviceName = timerName.replace('.timer', '.service')

  const timerPath = join(USER_UNIT_DIR, timerName)
  const servicePath = join(USER_UNIT_DIR, serviceName)

  // Check if already exists
  if (existsSync(timerPath)) {
    throw new Error(`Timer ${timerName} already exists`)
  }

  // Generate timer unit file
  const timerContent = `[Unit]
Description=${config.description}

[Timer]
OnCalendar=${config.schedule}
${config.persistent !== false ? 'Persistent=true' : ''}

[Install]
WantedBy=timers.target
`

  // Generate service unit file
  const envLines = config.environment
    ? Object.entries(config.environment)
        .map(([k, v]) => `Environment="${k}=${v}"`)
        .join('\n')
    : ''

  const serviceContent = `[Unit]
Description=${config.description}

[Service]
Type=oneshot
ExecStart=${config.command}
${config.workingDirectory ? `WorkingDirectory=${config.workingDirectory}` : ''}
${envLines}

[Install]
WantedBy=default.target
`

  // Write files
  writeFileSync(timerPath, timerContent)
  writeFileSync(servicePath, serviceContent)

  // Reload daemon and enable timer
  systemctl(['daemon-reload'], 'user')
  systemctl(['enable', '--now', timerName], 'user')

  log.jobs.info('Timer created', { name: timerName, schedule: config.schedule })
}

// Update an existing user timer
export function updateTimer(name: string, updates: UpdateTimerRequest): void {
  const timerName = name.endsWith('.timer') ? name : `${name}.timer`
  const serviceName = timerName.replace('.timer', '.service')

  const timerPath = join(USER_UNIT_DIR, timerName)
  const servicePath = join(USER_UNIT_DIR, serviceName)

  if (!existsSync(timerPath)) {
    throw new Error(`Timer ${timerName} not found`)
  }

  // Read existing files
  let timerContent = readFileSync(timerPath, 'utf-8')
  let serviceContent = existsSync(servicePath) ? readFileSync(servicePath, 'utf-8') : ''

  // Update timer content
  if (updates.description !== undefined) {
    timerContent = timerContent.replace(/^Description=.*$/m, `Description=${updates.description}`)
    serviceContent = serviceContent.replace(/^Description=.*$/m, `Description=${updates.description}`)
  }

  if (updates.schedule !== undefined) {
    timerContent = timerContent.replace(/^OnCalendar=.*$/m, `OnCalendar=${updates.schedule}`)
  }

  if (updates.persistent !== undefined) {
    if (updates.persistent) {
      if (!timerContent.includes('Persistent=')) {
        timerContent = timerContent.replace('[Timer]', '[Timer]\nPersistent=true')
      } else {
        timerContent = timerContent.replace(/^Persistent=.*$/m, 'Persistent=true')
      }
    } else {
      timerContent = timerContent.replace(/^Persistent=.*\n?/m, '')
    }
  }

  // Update service content
  if (updates.command !== undefined) {
    serviceContent = serviceContent.replace(/^ExecStart=.*$/m, `ExecStart=${updates.command}`)
  }

  if (updates.workingDirectory !== undefined) {
    if (serviceContent.includes('WorkingDirectory=')) {
      serviceContent = serviceContent.replace(/^WorkingDirectory=.*$/m, `WorkingDirectory=${updates.workingDirectory}`)
    } else {
      serviceContent = serviceContent.replace('[Service]', `[Service]\nWorkingDirectory=${updates.workingDirectory}`)
    }
  }

  // Write updated files
  writeFileSync(timerPath, timerContent)
  if (serviceContent) {
    writeFileSync(servicePath, serviceContent)
  }

  // Reload daemon
  systemctl(['daemon-reload'], 'user')

  log.jobs.info('Timer updated', { name: timerName })
}

// Delete a user timer
export function deleteTimer(name: string): void {
  const timerName = name.endsWith('.timer') ? name : `${name}.timer`
  const serviceName = timerName.replace('.timer', '.service')

  const timerPath = join(USER_UNIT_DIR, timerName)
  const servicePath = join(USER_UNIT_DIR, serviceName)

  // Stop and disable first
  try {
    systemctl(['stop', timerName], 'user')
  } catch {
    // May not be running
  }

  try {
    systemctl(['disable', timerName], 'user')
  } catch {
    // May not be enabled
  }

  // Remove files
  if (existsSync(timerPath)) {
    unlinkSync(timerPath)
  }

  if (existsSync(servicePath)) {
    unlinkSync(servicePath)
  }

  // Reload daemon
  systemctl(['daemon-reload'], 'user')

  log.jobs.info('Timer deleted', { name: timerName })
}

// Reload systemd daemon
export function reloadDaemon(scope: JobScope = 'user'): void {
  systemctl(['daemon-reload'], scope)
}
