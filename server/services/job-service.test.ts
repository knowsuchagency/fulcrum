import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test'
import * as os from 'node:os'
import * as childProcess from 'node:child_process'
import * as fs from 'node:fs'

// Need to reset module cache between tests for platform detection
async function resetJobServiceModule() {
  // Clear the module cache for both job-service and its dependencies
  const modulePaths = [
    require.resolve('./job-service'),
    require.resolve('./launchd-service'),
    require.resolve('./systemd-timer'),
  ]
  for (const path of modulePaths) {
    delete require.cache[path]
  }
  return await import('./job-service')
}

describe('job-service', () => {
  afterEach(() => {
    mock.restore()
  })

  describe('getPlatform', () => {
    test('returns launchd on darwin with working launchctl', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        throw new Error('not found')
      })

      const fresh = await resetJobServiceModule()
      expect(fresh.getPlatform()).toBe('launchd')

      platformMock.mockRestore()
      execMock.mockRestore()
    })

    test('returns systemd on linux with working systemctl', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('linux')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'systemctl --version') return 'systemd 252' as any
        throw new Error('not found')
      })

      const fresh = await resetJobServiceModule()
      expect(fresh.getPlatform()).toBe('systemd')

      platformMock.mockRestore()
      execMock.mockRestore()
    })

    test('returns null on unsupported platform', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('win32')

      const fresh = await resetJobServiceModule()
      expect(fresh.getPlatform()).toBeNull()

      platformMock.mockRestore()
    })

    test('returns null when neither launchctl nor systemctl available', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('linux')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation(() => {
        throw new Error('command not found')
      })

      const fresh = await resetJobServiceModule()
      expect(fresh.getPlatform()).toBeNull()

      platformMock.mockRestore()
      execMock.mockRestore()
    })
  })

  describe('isJobsAvailable', () => {
    test('returns true when platform is available', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        throw new Error('not found')
      })

      const fresh = await resetJobServiceModule()
      expect(fresh.isJobsAvailable()).toBe(true)

      platformMock.mockRestore()
      execMock.mockRestore()
    })

    test('returns false when platform is not available', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('win32')

      const fresh = await resetJobServiceModule()
      expect(fresh.isJobsAvailable()).toBe(false)

      platformMock.mockRestore()
    })
  })

  describe('canCreateJobs', () => {
    test('returns true only on systemd (Linux)', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('linux')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'systemctl --version') return 'systemd 252' as any
        throw new Error('not found')
      })

      const fresh = await resetJobServiceModule()
      expect(fresh.canCreateJobs()).toBe(true)

      platformMock.mockRestore()
      execMock.mockRestore()
    })

    test('returns false on launchd (macOS)', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        throw new Error('not found')
      })

      const fresh = await resetJobServiceModule()
      expect(fresh.canCreateJobs()).toBe(false)

      platformMock.mockRestore()
      execMock.mockRestore()
    })

    test('returns false when platform is not available', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('win32')

      const fresh = await resetJobServiceModule()
      expect(fresh.canCreateJobs()).toBe(false)

      platformMock.mockRestore()
    })
  })

  describe('listJobs', () => {
    test('returns empty array when no platform available', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('win32')

      const fresh = await resetJobServiceModule()
      const jobs = fresh.listJobs()

      expect(jobs).toEqual([])

      platformMock.mockRestore()
    })

    test('delegates to launchd on darwin', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        if (cmd === 'launchctl list') return 'PID\tStatus\tLabel\n' as any
        return '' as any
      })
      const existsMock = spyOn(fs, 'existsSync').mockReturnValue(false)

      const fresh = await resetJobServiceModule()
      const jobs = fresh.listJobs()

      expect(Array.isArray(jobs)).toBe(true)

      platformMock.mockRestore()
      execMock.mockRestore()
      existsMock.mockRestore()
    })
  })

  describe('getJob', () => {
    test('returns null when no platform available', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('win32')

      const fresh = await resetJobServiceModule()
      const job = fresh.getJob('com.test.job', 'user')

      expect(job).toBeNull()

      platformMock.mockRestore()
    })
  })

  describe('getJobLogs', () => {
    test('returns empty array when no platform available', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('win32')

      const fresh = await resetJobServiceModule()
      const logs = fresh.getJobLogs('com.test.job', 'user')

      expect(logs).toEqual([])

      platformMock.mockRestore()
    })
  })

  describe('mutation operations on non-systemd platform', () => {
    test('enableJob throws on launchd', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        throw new Error('not found')
      })

      const fresh = await resetJobServiceModule()

      expect(() => fresh.enableJob('com.test.job', 'user', true)).toThrow(
        'Job modification not supported on this platform'
      )

      platformMock.mockRestore()
      execMock.mockRestore()
    })

    test('startJob throws on launchd', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        throw new Error('not found')
      })

      const fresh = await resetJobServiceModule()

      expect(() => fresh.startJob('com.test.job', 'user')).toThrow(
        'Job modification not supported on this platform'
      )

      platformMock.mockRestore()
      execMock.mockRestore()
    })

    test('stopJob throws on launchd', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        throw new Error('not found')
      })

      const fresh = await resetJobServiceModule()

      expect(() => fresh.stopJob('com.test.job', 'user')).toThrow(
        'Job modification not supported on this platform'
      )

      platformMock.mockRestore()
      execMock.mockRestore()
    })

    test('runJobNow throws on launchd', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        throw new Error('not found')
      })

      const fresh = await resetJobServiceModule()

      expect(() => fresh.runJobNow('com.test.job', 'user')).toThrow(
        'Job modification not supported on this platform'
      )

      platformMock.mockRestore()
      execMock.mockRestore()
    })

    test('createJob throws on launchd', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        throw new Error('not found')
      })

      const fresh = await resetJobServiceModule()

      expect(() =>
        fresh.createJob({
          name: 'test-job',
          command: '/usr/bin/test',
          schedule: '* * * * *',
        })
      ).toThrow('Job creation not supported on this platform')

      platformMock.mockRestore()
      execMock.mockRestore()
    })

    test('updateJob throws on launchd', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        throw new Error('not found')
      })

      const fresh = await resetJobServiceModule()

      expect(() => fresh.updateJob('test-job', { command: '/usr/bin/new' })).toThrow(
        'Job modification not supported on this platform'
      )

      platformMock.mockRestore()
      execMock.mockRestore()
    })

    test('deleteJob throws on launchd', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('darwin')
      const execMock = spyOn(childProcess, 'execSync').mockImplementation((cmd: string) => {
        if (cmd === 'launchctl version') return 'launchd version 2.0' as any
        throw new Error('not found')
      })

      const fresh = await resetJobServiceModule()

      expect(() => fresh.deleteJob('test-job')).toThrow('Job deletion not supported on this platform')

      platformMock.mockRestore()
      execMock.mockRestore()
    })
  })

  describe('mutation operations on unsupported platform', () => {
    test('all mutations throw when no platform available', async () => {
      const platformMock = spyOn(os, 'platform').mockReturnValue('win32')

      const fresh = await resetJobServiceModule()

      expect(() => fresh.enableJob('test', 'user', true)).toThrow()
      expect(() => fresh.startJob('test', 'user')).toThrow()
      expect(() => fresh.stopJob('test', 'user')).toThrow()
      expect(() => fresh.runJobNow('test', 'user')).toThrow()
      expect(() => fresh.createJob({ name: 'test', command: '/bin/test', schedule: '* * * * *' })).toThrow()
      expect(() => fresh.updateJob('test', { command: '/bin/new' })).toThrow()
      expect(() => fresh.deleteJob('test')).toThrow()

      platformMock.mockRestore()
    })
  })
})
