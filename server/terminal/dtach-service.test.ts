import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'
import { DtachService, getDtachService } from './dtach-service'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

describe('DtachService', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('isAvailable', () => {
    test('returns boolean indicating dtach availability', () => {
      const available = DtachService.isAvailable()
      expect(typeof available).toBe('boolean')
    })
  })

  describe('constructor', () => {
    test('creates sockets directory if it does not exist', () => {
      const service = new DtachService()
      const socketsDir = join(testEnv.viboraDir, 'sockets')
      expect(existsSync(socketsDir)).toBe(true)
    })
  })

  describe('getSocketPath', () => {
    test('returns path in sockets directory', () => {
      const service = new DtachService()
      const socketPath = service.getSocketPath('test-terminal-id')

      expect(socketPath).toContain('sockets')
      expect(socketPath).toContain('terminal-test-terminal-id.sock')
    })

    test('returns consistent path for same terminal ID', () => {
      const service = new DtachService()
      const path1 = service.getSocketPath('my-terminal')
      const path2 = service.getSocketPath('my-terminal')

      expect(path1).toBe(path2)
    })

    test('returns different paths for different terminal IDs', () => {
      const service = new DtachService()
      const path1 = service.getSocketPath('terminal-1')
      const path2 = service.getSocketPath('terminal-2')

      expect(path1).not.toBe(path2)
    })
  })

  describe('hasSession', () => {
    test('returns false for non-existent session', () => {
      const service = new DtachService()
      expect(service.hasSession('nonexistent-terminal')).toBe(false)
    })
  })

  describe('getCreateCommand', () => {
    test('returns dtach command array with correct flags', () => {
      const service = new DtachService()
      const cmd = service.getCreateCommand('test-id')

      expect(cmd[0]).toBe('dtach')
      expect(cmd).toContain('-n') // Don't attach after creating
      expect(cmd).toContain('-z') // Disable suspend key
    })

    test('includes socket path in command', () => {
      const service = new DtachService()
      const cmd = service.getCreateCommand('test-id')
      const socketPath = service.getSocketPath('test-id')

      expect(cmd).toContain(socketPath)
    })

    test('uses SHELL env var or defaults to /bin/bash', () => {
      const originalShell = process.env.SHELL

      // Test with custom shell
      process.env.SHELL = '/bin/zsh'
      const service1 = new DtachService()
      const cmd1 = service1.getCreateCommand('test-1')
      expect(cmd1).toContain('/bin/zsh')

      // Test with no shell (default)
      delete process.env.SHELL
      const service2 = new DtachService()
      const cmd2 = service2.getCreateCommand('test-2')
      expect(cmd2).toContain('/bin/bash')

      // Restore
      if (originalShell) {
        process.env.SHELL = originalShell
      }
    })
  })

  describe('getAttachCommand', () => {
    test('returns dtach attach command array', () => {
      const service = new DtachService()
      const cmd = service.getAttachCommand('test-id')

      expect(cmd[0]).toBe('dtach')
      expect(cmd).toContain('-a') // Attach mode
      expect(cmd).toContain('-z') // Disable suspend key
    })

    test('includes socket path in command', () => {
      const service = new DtachService()
      const cmd = service.getAttachCommand('test-id')
      const socketPath = service.getSocketPath('test-id')

      expect(cmd).toContain(socketPath)
    })
  })

  describe('getDtachService', () => {
    test('returns DtachService instance', () => {
      const service = getDtachService()
      expect(service).toBeInstanceOf(DtachService)
    })

    test('returns same instance on subsequent calls (singleton)', () => {
      const service1 = getDtachService()
      const service2 = getDtachService()
      expect(service1).toBe(service2)
    })
  })

  describe('killSession', () => {
    test('does not throw for non-existent session', () => {
      const service = new DtachService()
      expect(() => service.killSession('nonexistent')).not.toThrow()
    })
  })

  describe('killClaudeInSession', () => {
    test('returns false for non-existent session', () => {
      const service = new DtachService()
      const result = service.killClaudeInSession('nonexistent')
      expect(result).toBe(false)
    })
  })
})
