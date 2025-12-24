import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { db } from '../db'
import { systemMetrics } from '../db/schema'
import { lt } from 'drizzle-orm'

const COLLECT_INTERVAL = 5_000 // 5 seconds
const RETENTION_HOURS = 24
const isMacOS = process.platform === 'darwin'

interface CpuSnapshot {
  idle: number
  total: number
}

interface MemoryInfo {
  total: number
  used: number // Actual used (excluding cache/buffers)
  cache: number // Cache + Buffers
}

// Parse memory info using platform-specific methods
// Returns memory values in bytes
function getMemoryInfo(): MemoryInfo {
  if (isMacOS) {
    return getMemoryInfoMacOS()
  }
  return getMemoryInfoLinux()
}

// macOS: Use vm_stat and sysctl for accurate memory breakdown
function getMemoryInfoMacOS(): MemoryInfo {
  try {
    // Get total memory from sysctl
    const totalStr = execSync('sysctl -n hw.memsize', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    const total = parseInt(totalStr, 10)

    // Parse vm_stat output
    const vmstat = execSync('vm_stat', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Extract page size from first line: "Mach Virtual Memory Statistics: (page size of 16384 bytes)"
    const pageSizeMatch = vmstat.match(/page size of (\d+) bytes/)
    const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 16384

    // Parse page counts (format: "Pages free:                               19826.")
    const parsePages = (key: string): number => {
      const match = vmstat.match(new RegExp(`${key}:\\s+([\\d.]+)`))
      return match ? Math.floor(parseFloat(match[1])) : 0
    }

    const pagesActive = parsePages('Pages active')
    const pagesInactive = parsePages('Pages inactive')
    const pagesWired = parsePages('Pages wired down')
    const pagesCompressorOccupied = parsePages('Pages occupied by compressor')
    const pagesPurgeable = parsePages('Pages purgeable')

    // Calculate memory usage like Activity Monitor:
    // - Used = Wired + Active + Occupied by Compressor (actual RAM being used)
    // - Cache = Inactive + Purgeable (can be reclaimed if needed)
    const wiredBytes = pagesWired * pageSize
    const activeBytes = pagesActive * pageSize
    const compressorOccupiedBytes = pagesCompressorOccupied * pageSize
    const inactiveBytes = pagesInactive * pageSize
    const purgeableBytes = pagesPurgeable * pageSize

    const used = wiredBytes + activeBytes + compressorOccupiedBytes
    const cache = inactiveBytes + purgeableBytes

    return {
      total,
      used: Math.max(used, 0),
      cache: Math.max(cache, 0),
    }
  } catch (err) {
    console.error('Failed to get macOS memory info:', err)
    // Fallback to basic Node.js API
    const total = os.totalmem()
    const free = os.freemem()
    return {
      total,
      used: total - free,
      cache: 0,
    }
  }
}

// Linux: Parse /proc/meminfo for accurate memory breakdown
function getMemoryInfoLinux(): MemoryInfo {
  const total = os.totalmem()

  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf-8')
    const values: Record<string, number> = {}

    for (const line of meminfo.split('\n')) {
      const match = line.match(/^(\w+):\s+(\d+)\s+kB/)
      if (match) {
        values[match[1]] = parseInt(match[2], 10) * 1024 // Convert kB to bytes
      }
    }

    const memTotal = values['MemTotal'] || total
    const memFree = values['MemFree'] || 0
    const buffers = values['Buffers'] || 0
    const cached = values['Cached'] || 0
    const sReclaimable = values['SReclaimable'] || 0
    const shmem = values['Shmem'] || 0

    // Calculate cache/buffers (like Beszel/htop)
    // Note: gopsutil adds SReclaimable to Cached, so we do the same
    let cacheBuffers = buffers + cached + sReclaimable - shmem
    if (cacheBuffers < 0) {
      cacheBuffers = 0
    }

    // Used = Total - Free - Buffers - Cached - SReclaimable + Shmem
    // This matches htop's "used" calculation
    const used = memTotal - memFree - buffers - cached - sReclaimable + shmem

    return {
      total: memTotal,
      used: Math.max(used, 0),
      cache: cacheBuffers,
    }
  } catch {
    // Fallback to basic Node.js API (includes cache in "used")
    const free = os.freemem()
    return {
      total,
      used: total - free,
      cache: 0,
    }
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null
let previousCpu: CpuSnapshot | null = null

// Calculate CPU usage by comparing current snapshot to previous
function getCpuSnapshot(): CpuSnapshot {
  const cpus = os.cpus()
  let idle = 0
  let total = 0

  for (const cpu of cpus) {
    idle += cpu.times.idle
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq
  }

  return { idle, total }
}

function calculateCpuPercent(): number {
  const current = getCpuSnapshot()

  if (!previousCpu) {
    previousCpu = current
    return 0
  }

  const idleDiff = current.idle - previousCpu.idle
  const totalDiff = current.total - previousCpu.total

  previousCpu = current

  if (totalDiff === 0) return 0

  const usedPercent = ((totalDiff - idleDiff) / totalDiff) * 100
  return Math.round(usedPercent * 100) / 100 // Round to 2 decimal places
}

// Get disk usage for root filesystem
function getDiskUsage(): { used: number; total: number } {
  try {
    if (isMacOS) {
      // macOS APFS: Query /System/Volumes/Data for user data volume
      // The root "/" is just a read-only system snapshot with minimal usage
      // Format: Filesystem 1024-blocks Used Available Capacity iused ifree %iused Mounted
      const output = execSync('df -k /System/Volumes/Data 2>/dev/null || df -k /', {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: '/bin/bash',
      })
      const lines = output.trim().split('\n')
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/)
        // parts[2] = used in KB, parts[3] = available in KB
        // Use (used + available) as total to match Finder/Disk Utility
        if (parts.length >= 4) {
          const used = (parseInt(parts[2], 10) || 0) * 1024 // Convert KB to bytes
          const available = (parseInt(parts[3], 10) || 0) * 1024
          const total = used + available
          return { used, total }
        }
      }
    } else {
      // Linux: Use df -B1 (bytes)
      const output = execSync('df -B1 / | tail -1', {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const parts = output.trim().split(/\s+/)
      // Format: Filesystem 1B-blocks Used Available Use% Mounted
      if (parts.length >= 4) {
        const total = parseInt(parts[1], 10) || 0
        const used = parseInt(parts[2], 10) || 0
        return { used, total }
      }
    }
  } catch (err) {
    console.error('Failed to get disk usage:', err)
  }

  return { used: 0, total: 0 }
}

function collectMetrics(): void {
  const timestamp = Math.floor(Date.now() / 1000) // Unix timestamp in seconds
  const cpuPercent = calculateCpuPercent()
  const memory = getMemoryInfo()
  const disk = getDiskUsage()

  db.insert(systemMetrics)
    .values({
      timestamp,
      cpuPercent,
      memoryUsedBytes: memory.used,
      memoryTotalBytes: memory.total,
      memoryCacheBytes: memory.cache,
      diskUsedBytes: disk.used,
      diskTotalBytes: disk.total,
    })
    .run()
}

function pruneOldMetrics(): void {
  const cutoff = Math.floor(Date.now() / 1000) - RETENTION_HOURS * 60 * 60 // 24 hours ago
  const result = db.delete(systemMetrics).where(lt(systemMetrics.timestamp, cutoff)).run()

  if (result.changes > 0) {
    console.log(`[MetricsCollector] Pruned ${result.changes} old metrics records`)
  }
}

export function startMetricsCollector(): void {
  if (intervalId) return // Already running

  console.log(`Metrics collector started (${COLLECT_INTERVAL / 1000}s interval)`)

  // Initialize CPU baseline
  previousCpu = getCpuSnapshot()

  // Collect immediately after a short delay (to get first CPU reading)
  setTimeout(() => {
    collectMetrics()
  }, 1000)

  // Then collect every 5 seconds
  intervalId = setInterval(() => {
    collectMetrics()
  }, COLLECT_INTERVAL)

  // Prune old metrics every hour
  setInterval(() => {
    pruneOldMetrics()
  }, 60 * 60 * 1000)

  // Prune once on startup
  pruneOldMetrics()
}

export function stopMetricsCollector(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    console.log('Metrics collector stopped')
  }
}

// Get metrics for a specific time window
export function getMetrics(
  windowSeconds: number
): Array<{
  timestamp: number
  cpuPercent: number
  memoryUsedPercent: number
  memoryCachePercent: number
  diskUsedPercent: number
}> {
  const cutoff = Math.floor(Date.now() / 1000) - windowSeconds

  const rows = db
    .select()
    .from(systemMetrics)
    .where(lt(systemMetrics.timestamp, cutoff) ? undefined : undefined)
    .all()
    .filter((r) => r.timestamp >= cutoff)

  return rows.map((row) => ({
    timestamp: row.timestamp,
    cpuPercent: row.cpuPercent,
    memoryUsedPercent: row.memoryTotalBytes > 0 ? (row.memoryUsedBytes / row.memoryTotalBytes) * 100 : 0,
    memoryCachePercent: row.memoryTotalBytes > 0 ? (row.memoryCacheBytes / row.memoryTotalBytes) * 100 : 0,
    diskUsedPercent: row.diskTotalBytes > 0 ? (row.diskUsedBytes / row.diskTotalBytes) * 100 : 0,
  }))
}

// Get current system metrics (latest reading)
export function getCurrentMetrics(): {
  cpu: number
  memory: { total: number; used: number; cache: number; usedPercent: number; cachePercent: number }
  disk: { total: number; used: number; usedPercent: number; path: string }
} {
  const memory = getMemoryInfo()
  const disk = getDiskUsage()

  // Get most recent CPU reading from database
  const latest = db
    .select()
    .from(systemMetrics)
    .orderBy(systemMetrics.timestamp)
    .limit(1)
    .all()

  return {
    cpu: latest.length > 0 ? latest[0].cpuPercent : 0,
    memory: {
      total: memory.total,
      used: memory.used,
      cache: memory.cache,
      usedPercent: memory.total > 0 ? (memory.used / memory.total) * 100 : 0,
      cachePercent: memory.total > 0 ? (memory.cache / memory.total) * 100 : 0,
    },
    disk: {
      total: disk.total,
      used: disk.used,
      usedPercent: disk.total > 0 ? (disk.used / disk.total) * 100 : 0,
      path: '/',
    },
  }
}
