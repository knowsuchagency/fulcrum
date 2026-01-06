import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import * as os from 'node:os'
import * as childProcess from 'node:child_process'
import * as fs from 'node:fs'

// Store original functions
const originalPlatform = os.platform
const originalExecSync = childProcess.execSync
const originalExistsSync = fs.existsSync
const originalReaddirSync = fs.readdirSync

// We need to reset the module cache to test isLaunchdAvailable with different platforms
async function resetLaunchdModule() {
  // Delete the cached module
  const modulePath = require.resolve('./launchd-service')
  delete require.cache[modulePath]
  // Re-import - using dynamic import to get fresh module
  return await import('./launchd-service')
}

describe('launchd-service', () => {
  // Import once for tests that don't need fresh module
  let launchd: typeof import('./launchd-service')

  beforeEach(async () => {
    launchd = await import('./launchd-service')
  })

  afterEach(() => {
    // Restore mocked functions
    mock.restore()
  })

  describe('isLaunchdAvailable', () => {
    test('returns false on non-darwin platform', async () => {
      // Mock platform to return 'linux'
      const platformMock = spyOn(os, 'platform').mockReturnValue('linux')

      // Need fresh module to reset cached availability
      const fresh = await resetLaunchdModule()
      expect(fresh.isLaunchdAvailable()).toBe(false)

      platformMock.mockRestore()
    })

    test('returns true on darwin with working launchctl', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockReturnValue('launchd version 2.0' as any)

      const fresh = await resetLaunchdModule()
      expect(fresh.isLaunchdAvailable()).toBe(true)

      platformMock.mockRestore()
      execMock.mockRestore()
    })

    test('returns false on darwin when launchctl fails', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation(() => {
        throw new Error('command not found')
      })

      const fresh = await resetLaunchdModule()
      expect(fresh.isLaunchdAvailable()).toBe(false)

      platformMock.mockRestore()
      execMock.mockRestore()
    })
  })

  describe('listJobs', () => {
    test('returns empty array when no plist directories exist', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        if (cmd === 'launchctl list') return 'PID\tStatus\tLabel\n' as any
        return '' as any
      })
      const existsMock = spyOn(fs, 'existsSync').mockReturnValue(false)

      const fresh = await resetLaunchdModule()
      const jobs = fresh.listJobs()

      expect(jobs).toEqual([])

      platformMock.mockRestore()
      execMock.mockRestore()
      existsMock.mockRestore()
    })

    test('parses user LaunchAgents correctly', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        if (cmd === 'launchctl list') {
          return 'PID\tStatus\tLabel\n1234\t0\tcom.test.job\n' as any
        }
        if (cmd.includes('plutil')) {
          return JSON.stringify({
            Label: 'com.test.job',
            ProgramArguments: ['/usr/bin/test', '-arg'],
            StartInterval: 3600,
          })
        }
        if (cmd.includes('cat')) {
          return '<?xml ...>'
        }
        return '' as any
      })
      const existsMock = spyOn(fs, 'existsSync').mockImplementation((path: any) => {
        const pathStr = String(path)
        return pathStr.includes('LaunchAgents')
      })
      const readdirMock = spyOn(fs, 'readdirSync').mockImplementation((path: any) => {
        const pathStr = String(path)
        if (pathStr.includes('LaunchAgents')) {
          return ['com.test.job.plist'] as any
        }
        return [] as any
      })

      const fresh = await resetLaunchdModule()
      const jobs = fresh.listJobs('user')

      expect(jobs.length).toBe(1)
      expect(jobs[0].name).toBe('com.test.job')
      expect(jobs[0].scope).toBe('user')
      expect(jobs[0].state).toBe('active') // Has PID
      expect(jobs[0].enabled).toBe(true) // In launchctl list and not disabled
      expect(jobs[0].schedule).toBe('Every 1h')

      platformMock.mockRestore()
      execMock.mockRestore()
      existsMock.mockRestore()
      readdirMock.mockRestore()
    })

    test('handles KeepAlive jobs', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        if (cmd === 'launchctl list') {
          return 'PID\tStatus\tLabel\n1234\t0\tcom.keepalive.job\n' as any
        }
        if (cmd.includes('plutil')) {
          return JSON.stringify({
            Label: 'com.keepalive.job',
            ProgramArguments: ['/usr/bin/daemon'],
            KeepAlive: true,
          })
        }
        return '' as any
      })
      const existsMock = spyOn(fs, 'existsSync').mockImplementation((path: any) => {
        return String(path).includes('LaunchAgents')
      })
      const readdirMock = spyOn(fs, 'readdirSync').mockImplementation((path: any) => {
        if (String(path).includes('LaunchAgents')) {
          return ['com.keepalive.job.plist'] as any
        }
        return [] as any
      })

      const fresh = await resetLaunchdModule()
      const jobs = fresh.listJobs('user')

      expect(jobs[0].schedule).toBe('KeepAlive')
      expect(jobs[0].nextRun).toBeNull() // KeepAlive jobs don't have next run

      platformMock.mockRestore()
      execMock.mockRestore()
      existsMock.mockRestore()
      readdirMock.mockRestore()
    })

    test('handles RunAtLoad jobs', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        if (cmd === 'launchctl list') {
          return 'PID\tStatus\tLabel\n-\t0\tcom.runload.job\n' as any
        }
        if (cmd.includes('plutil')) {
          return JSON.stringify({
            Label: 'com.runload.job',
            ProgramArguments: ['/usr/bin/script'],
            RunAtLoad: true,
          })
        }
        return '' as any
      })
      const existsMock = spyOn(fs, 'existsSync').mockImplementation((path: any) => {
        return String(path).includes('LaunchAgents')
      })
      const readdirMock = spyOn(fs, 'readdirSync').mockImplementation((path: any) => {
        if (String(path).includes('LaunchAgents')) {
          return ['com.runload.job.plist'] as any
        }
        return [] as any
      })

      const fresh = await resetLaunchdModule()
      const jobs = fresh.listJobs('user')

      expect(jobs[0].schedule).toBe('RunAtLoad')
      expect(jobs[0].state).toBe('waiting') // No PID, status 0

      platformMock.mockRestore()
      execMock.mockRestore()
      existsMock.mockRestore()
      readdirMock.mockRestore()
    })

    test('detects failed jobs from exit status', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        if (cmd === 'launchctl list') {
          return 'PID\tStatus\tLabel\n-\t78\tcom.failed.job\n' as any
        }
        if (cmd.includes('plutil')) {
          return JSON.stringify({
            Label: 'com.failed.job',
            ProgramArguments: ['/usr/bin/fail'],
            StartInterval: 300,
          })
        }
        return '' as any
      })
      const existsMock = spyOn(fs, 'existsSync').mockImplementation((path: any) => {
        return String(path).includes('LaunchAgents')
      })
      const readdirMock = spyOn(fs, 'readdirSync').mockImplementation((path: any) => {
        if (String(path).includes('LaunchAgents')) {
          return ['com.failed.job.plist'] as any
        }
        return [] as any
      })

      const fresh = await resetLaunchdModule()
      const jobs = fresh.listJobs('user')

      expect(jobs[0].state).toBe('failed')
      expect(jobs[0].lastResult).toBe('failed')

      platformMock.mockRestore()
      execMock.mockRestore()
      existsMock.mockRestore()
      readdirMock.mockRestore()
    })

    test('handles calendar interval schedules', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        if (cmd === 'launchctl list') {
          return 'PID\tStatus\tLabel\n-\t0\tcom.calendar.job\n' as any
        }
        if (cmd.includes('plutil')) {
          return JSON.stringify({
            Label: 'com.calendar.job',
            ProgramArguments: ['/usr/bin/backup'],
            StartCalendarInterval: { Hour: 2, Minute: 30 },
          })
        }
        return '' as any
      })
      const existsMock = spyOn(fs, 'existsSync').mockImplementation((path: any) => {
        return String(path).includes('LaunchAgents')
      })
      const readdirMock = spyOn(fs, 'readdirSync').mockImplementation((path: any) => {
        if (String(path).includes('LaunchAgents')) {
          return ['com.calendar.job.plist'] as any
        }
        return [] as any
      })

      const fresh = await resetLaunchdModule()
      const jobs = fresh.listJobs('user')

      expect(jobs[0].schedule).toBe('Daily at 02:30')
      expect(jobs[0].nextRun).not.toBeNull()

      platformMock.mockRestore()
      execMock.mockRestore()
      existsMock.mockRestore()
      readdirMock.mockRestore()
    })

    test('handles weekday schedules', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        if (cmd === 'launchctl list') {
          return 'PID\tStatus\tLabel\n-\t0\tcom.weekly.job\n' as any
        }
        if (cmd.includes('plutil')) {
          return JSON.stringify({
            Label: 'com.weekly.job',
            ProgramArguments: ['/usr/bin/weekly'],
            StartCalendarInterval: { Weekday: 1, Hour: 9, Minute: 0 },
          })
        }
        return '' as any
      })
      const existsMock = spyOn(fs, 'existsSync').mockImplementation((path: any) => {
        return String(path).includes('LaunchAgents')
      })
      const readdirMock = spyOn(fs, 'readdirSync').mockImplementation((path: any) => {
        if (String(path).includes('LaunchAgents')) {
          return ['com.weekly.job.plist'] as any
        }
        return [] as any
      })

      const fresh = await resetLaunchdModule()
      const jobs = fresh.listJobs('user')

      expect(jobs[0].schedule).toBe('Mon at 09:00')

      platformMock.mockRestore()
      execMock.mockRestore()
      existsMock.mockRestore()
      readdirMock.mockRestore()
    })

    test('scans system directories for system scope', async () => {
      let scannedDirs: string[] = []

      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        if (cmd === 'launchctl list') return 'PID\tStatus\tLabel\n' as any
        return '' as any
      })
      const existsMock = spyOn(fs, 'existsSync').mockReturnValue(true)
      const readdirMock = spyOn(fs, 'readdirSync').mockImplementation((path: any) => {
        scannedDirs.push(String(path))
        return [] as any
      })

      const fresh = await resetLaunchdModule()
      fresh.listJobs('system')

      // Should scan /Library/LaunchAgents and /Library/LaunchDaemons but not user dir
      expect(scannedDirs.some(d => d.includes('/Library/LaunchAgents'))).toBe(true)
      expect(scannedDirs.some(d => d.includes('/Library/LaunchDaemons'))).toBe(true)
      expect(scannedDirs.some(d => d.includes('~') || d.includes(os.homedir()))).toBe(false)

      platformMock.mockRestore()
      execMock.mockRestore()
      existsMock.mockRestore()
      readdirMock.mockRestore()
    })
  })

  describe('getJob', () => {
    test('returns null for non-existent job', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        if (cmd === 'launchctl list') return 'PID\tStatus\tLabel\n' as any
        throw new Error('not found')
      })
      const existsMock = spyOn(fs, 'existsSync').mockReturnValue(false)

      const fresh = await resetLaunchdModule()
      const job = fresh.getJob('com.nonexistent.job', 'user')

      expect(job).toBeNull()

      platformMock.mockRestore()
      execMock.mockRestore()
      existsMock.mockRestore()
    })

    test('returns detailed job info', async () => {
      const plistContent = '<?xml version="1.0"?><plist>...</plist>'

      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        if (cmd === 'launchctl list') {
          return 'PID\tStatus\tLabel\n1234\t0\tcom.detail.job\n' as any
        }
        if (cmd.includes('plutil')) {
          return JSON.stringify({
            Label: 'com.detail.job',
            ProgramArguments: ['/usr/bin/test', '-v', 'arg'],
            StartInterval: 1800,
            WorkingDirectory: '/tmp',
          })
        }
        if (cmd.includes('cat')) {
          return plistContent
        }
        return '' as any
      })
      const existsMock = spyOn(fs, 'existsSync').mockImplementation((path: any) => {
        return String(path).includes('com.detail.job.plist') || String(path).includes('LaunchAgents')
      })
      const readdirMock = spyOn(fs, 'readdirSync').mockImplementation((path: any) => {
        if (String(path).includes('LaunchAgents')) {
          return ['com.detail.job.plist'] as any
        }
        return [] as any
      })

      const fresh = await resetLaunchdModule()
      const job = fresh.getJob('com.detail.job', 'user')

      expect(job).not.toBeNull()
      expect(job!.name).toBe('com.detail.job')
      expect(job!.command).toBe('/usr/bin/test -v arg')
      expect(job!.workingDirectory).toBe('/tmp')
      expect(job!.schedule).toBe('Every 30m')
      expect(job!.timerContent).toBe(plistContent)
      expect(job!.serviceContent).toBeNull() // launchd doesn't have separate service files

      platformMock.mockRestore()
      execMock.mockRestore()
      existsMock.mockRestore()
      readdirMock.mockRestore()
    })
  })

  describe('getJobLogs', () => {
    test('returns empty array when job not found', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        if (cmd === 'launchctl list') return 'PID\tStatus\tLabel\n' as any
        throw new Error('not found')
      })
      const existsMock = spyOn(fs, 'existsSync').mockReturnValue(false)

      const fresh = await resetLaunchdModule()
      const logs = fresh.getJobLogs('com.nonexistent.job', 'user')

      expect(logs).toEqual([])

      platformMock.mockRestore()
      execMock.mockRestore()
      existsMock.mockRestore()
    })

    test('parses unified log output', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        if (cmd === 'launchctl list') {
          return 'PID\tStatus\tLabel\n1234\t0\tcom.logs.job\n' as any
        }
        if (cmd.includes('plutil')) {
          return JSON.stringify({
            Label: 'com.logs.job',
            ProgramArguments: ['/usr/bin/test'],
            StartInterval: 300,
          })
        }
        if (cmd.includes('log show')) {
          return JSON.stringify([
            { timestamp: '2026-01-06T10:00:00Z', eventMessage: 'Job started', messageType: 'Info' },
            { timestamp: '2026-01-06T10:00:01Z', eventMessage: 'Processing', messageType: 'Default' },
            { timestamp: '2026-01-06T10:00:02Z', eventMessage: 'Warning occurred', messageType: 'Warning' },
            { timestamp: '2026-01-06T10:00:03Z', eventMessage: 'Error occurred', messageType: 'Error' },
          ])
        }
        if (cmd.includes('cat')) {
          return '<?xml...>'
        }
        return '' as any
      })
      const existsMock = spyOn(fs, 'existsSync').mockImplementation((path: any) => {
        return String(path).includes('LaunchAgents') || String(path).includes('.plist')
      })
      const readdirMock = spyOn(fs, 'readdirSync').mockImplementation((path: any) => {
        if (String(path).includes('LaunchAgents')) {
          return ['com.logs.job.plist'] as any
        }
        return [] as any
      })

      const fresh = await resetLaunchdModule()
      const logs = fresh.getJobLogs('com.logs.job', 'user', 10)

      expect(logs.length).toBe(4)
      expect(logs[0].message).toBe('Job started')
      expect(logs[0].priority).toBe('info')
      expect(logs[2].priority).toBe('warning')
      expect(logs[3].priority).toBe('error')

      platformMock.mockRestore()
      execMock.mockRestore()
      existsMock.mockRestore()
      readdirMock.mockRestore()
    })

    test('returns empty array on log command failure', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        if (cmd === 'launchctl list') {
          return 'PID\tStatus\tLabel\n1234\t0\tcom.logs.job\n' as any
        }
        if (cmd.includes('plutil')) {
          return JSON.stringify({
            Label: 'com.logs.job',
            ProgramArguments: ['/usr/bin/test'],
          })
        }
        if (cmd.includes('log show')) {
          throw new Error('Permission denied')
        }
        if (cmd.includes('cat')) {
          return '<?xml...>'
        }
        return '' as any
      })
      const existsMock = spyOn(fs, 'existsSync').mockImplementation((path: any) => {
        return String(path).includes('LaunchAgents') || String(path).includes('.plist')
      })
      const readdirMock = spyOn(fs, 'readdirSync').mockImplementation((path: any) => {
        if (String(path).includes('LaunchAgents')) {
          return ['com.logs.job.plist'] as any
        }
        return [] as any
      })

      const fresh = await resetLaunchdModule()
      const logs = fresh.getJobLogs('com.logs.job', 'user')

      expect(logs).toEqual([])

      platformMock.mockRestore()
      execMock.mockRestore()
      existsMock.mockRestore()
      readdirMock.mockRestore()
    })
  })

  describe('schedule formatting', () => {
    test('formats seconds interval', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        if (cmd === 'launchctl list') return 'PID\tStatus\tLabel\n-\t0\tcom.secs.job\n' as any
        if (cmd.includes('plutil')) {
          return JSON.stringify({
            Label: 'com.secs.job',
            ProgramArguments: ['/bin/test'],
            StartInterval: 30,
          })
        }
        return '' as any
      })
      const existsMock = spyOn(fs, 'existsSync').mockReturnValue(true)
      const readdirMock = spyOn(fs, 'readdirSync').mockReturnValue(['com.secs.job.plist'] as any)

      const fresh = await resetLaunchdModule()
      const jobs = fresh.listJobs('user')

      expect(jobs[0].schedule).toBe('Every 30s')

      platformMock.mockRestore()
      execMock.mockRestore()
      existsMock.mockRestore()
      readdirMock.mockRestore()
    })

    test('formats minutes interval', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        if (cmd === 'launchctl list') return 'PID\tStatus\tLabel\n-\t0\tcom.mins.job\n' as any
        if (cmd.includes('plutil')) {
          return JSON.stringify({
            Label: 'com.mins.job',
            ProgramArguments: ['/bin/test'],
            StartInterval: 900, // 15 minutes
          })
        }
        return '' as any
      })
      const existsMock = spyOn(fs, 'existsSync').mockReturnValue(true)
      const readdirMock = spyOn(fs, 'readdirSync').mockReturnValue(['com.mins.job.plist'] as any)

      const fresh = await resetLaunchdModule()
      const jobs = fresh.listJobs('user')

      expect(jobs[0].schedule).toBe('Every 15m')

      platformMock.mockRestore()
      execMock.mockRestore()
      existsMock.mockRestore()
      readdirMock.mockRestore()
    })

    test('formats days interval', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        if (cmd === 'launchctl list') return 'PID\tStatus\tLabel\n-\t0\tcom.days.job\n' as any
        if (cmd.includes('plutil')) {
          return JSON.stringify({
            Label: 'com.days.job',
            ProgramArguments: ['/bin/test'],
            StartInterval: 172800, // 2 days
          })
        }
        return '' as any
      })
      const existsMock = spyOn(fs, 'existsSync').mockReturnValue(true)
      const readdirMock = spyOn(fs, 'readdirSync').mockReturnValue(['com.days.job.plist'] as any)

      const fresh = await resetLaunchdModule()
      const jobs = fresh.listJobs('user')

      expect(jobs[0].schedule).toBe('Every 2d')

      platformMock.mockRestore()
      execMock.mockRestore()
      existsMock.mockRestore()
      readdirMock.mockRestore()
    })

    test('handles multiple calendar intervals', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        if (cmd === 'launchctl list') return 'PID\tStatus\tLabel\n-\t0\tcom.multi.job\n' as any
        if (cmd.includes('plutil')) {
          return JSON.stringify({
            Label: 'com.multi.job',
            ProgramArguments: ['/bin/test'],
            StartCalendarInterval: [{ Hour: 9, Minute: 0 }, { Hour: 17, Minute: 0 }],
          })
        }
        return '' as any
      })
      const existsMock = spyOn(fs, 'existsSync').mockReturnValue(true)
      const readdirMock = spyOn(fs, 'readdirSync').mockReturnValue(['com.multi.job.plist'] as any)

      const fresh = await resetLaunchdModule()
      const jobs = fresh.listJobs('user')

      expect(jobs[0].schedule).toBe('2 schedules')

      platformMock.mockRestore()
      execMock.mockRestore()
      existsMock.mockRestore()
      readdirMock.mockRestore()
    })
  })
})
