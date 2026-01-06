/**
 * Platform abstraction layer for scheduled jobs.
 * Delegates to systemd on Linux and launchd on macOS.
 */
import { platform } from 'node:os'
import * as systemd from './systemd-timer'
import * as launchd from './launchd-service'
import type { JobScope, SystemdTimer, SystemdTimerDetail, JobLogEntry, CreateTimerRequest, UpdateTimerRequest } from '../../shared/types'

export type JobPlatform = 'systemd' | 'launchd' | null

// Get the current platform's job system
export function getPlatform(): JobPlatform {
  if (platform() === 'darwin' && launchd.isLaunchdAvailable()) {
    return 'launchd'
  }
  if (platform() === 'linux' && systemd.isSystemdAvailable()) {
    return 'systemd'
  }
  return null
}

// Check if jobs feature is available on this platform
export function isJobsAvailable(): boolean {
  return getPlatform() !== null
}

// Check if job creation/modification is supported
// Only systemd supports full CRUD - launchd is view-only
export function canCreateJobs(): boolean {
  return getPlatform() === 'systemd'
}

// List all jobs
export function listJobs(scope: 'all' | 'user' | 'system' = 'all'): SystemdTimer[] {
  const p = getPlatform()
  if (p === 'launchd') {
    return launchd.listJobs(scope)
  }
  if (p === 'systemd') {
    return systemd.listTimers(scope)
  }
  return []
}

// Get job details
export function getJob(name: string, scope: JobScope): SystemdTimerDetail | null {
  const p = getPlatform()
  if (p === 'launchd') {
    return launchd.getJob(name, scope)
  }
  if (p === 'systemd') {
    return systemd.getTimer(name, scope)
  }
  return null
}

// Get job logs
export function getJobLogs(name: string, scope: JobScope, lines: number = 100): JobLogEntry[] {
  const p = getPlatform()
  if (p === 'launchd') {
    return launchd.getJobLogs(name, scope, lines)
  }
  if (p === 'systemd') {
    return systemd.getTimerLogs(name, scope, lines)
  }
  return []
}

// The following functions only work on systemd and will throw on other platforms

export function enableJob(name: string, scope: JobScope, enable: boolean): void {
  if (!canCreateJobs()) {
    throw new Error('Job modification not supported on this platform')
  }
  systemd.enableTimer(name, scope, enable)
}

export function startJob(name: string, scope: JobScope): void {
  if (!canCreateJobs()) {
    throw new Error('Job modification not supported on this platform')
  }
  systemd.startTimer(name, scope)
}

export function stopJob(name: string, scope: JobScope): void {
  if (!canCreateJobs()) {
    throw new Error('Job modification not supported on this platform')
  }
  systemd.stopTimer(name, scope)
}

export function runJobNow(name: string, scope: JobScope): void {
  if (!canCreateJobs()) {
    throw new Error('Job modification not supported on this platform')
  }
  systemd.runNow(name, scope)
}

export function createJob(config: CreateTimerRequest): void {
  if (!canCreateJobs()) {
    throw new Error('Job creation not supported on this platform')
  }
  systemd.createTimer(config)
}

export function updateJob(name: string, updates: UpdateTimerRequest): void {
  if (!canCreateJobs()) {
    throw new Error('Job modification not supported on this platform')
  }
  systemd.updateTimer(name, updates)
}

export function deleteJob(name: string): void {
  if (!canCreateJobs()) {
    throw new Error('Job deletion not supported on this platform')
  }
  systemd.deleteTimer(name)
}
