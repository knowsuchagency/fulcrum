import { describe, test, expect } from 'bun:test'
import { handleAppsCommand } from '../../commands/apps'
import { CliError, ExitCodes } from '../../utils/errors'

describe('apps command', () => {
  describe('validation errors', () => {
    test('throws for unknown action', async () => {
      try {
        await handleAppsCommand('invalid', [], {})
        expect(true).toBe(false) // Should not reach here
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('UNKNOWN_ACTION')
        expect((err as CliError).exitCode).toBe(ExitCodes.INVALID_ARGS)
        expect((err as CliError).message).toContain('Unknown action: invalid')
      }
    })

    test('get: throws when id is missing', async () => {
      try {
        await handleAppsCommand('get', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ID')
        expect((err as CliError).message).toContain('App ID required')
      }
    })

    test('create: throws when name is missing', async () => {
      try {
        await handleAppsCommand('create', [], { 'repository-id': 'repo-123' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_NAME')
        expect((err as CliError).message).toContain('--name is required')
      }
    })

    test('create: throws when repository-id is missing', async () => {
      try {
        await handleAppsCommand('create', [], { name: 'Test' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_REPO_ID')
        expect((err as CliError).message).toContain('--repository-id is required')
      }
    })

    test('update: throws when id is missing', async () => {
      try {
        await handleAppsCommand('update', [], { name: 'New Name' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ID')
      }
    })

    test('update: throws when no updates provided', async () => {
      try {
        await handleAppsCommand('update', ['app-123'], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('NO_UPDATES')
        expect((err as CliError).message).toContain('No updates provided')
      }
    })

    test('delete: throws when id is missing', async () => {
      try {
        await handleAppsCommand('delete', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ID')
      }
    })

    test('deploy: throws when id is missing', async () => {
      try {
        await handleAppsCommand('deploy', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ID')
      }
    })

    test('stop: throws when id is missing', async () => {
      try {
        await handleAppsCommand('stop', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ID')
      }
    })

    test('logs: throws when id is missing', async () => {
      try {
        await handleAppsCommand('logs', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ID')
      }
    })

    test('status: throws when id is missing', async () => {
      try {
        await handleAppsCommand('status', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ID')
      }
    })

    test('deployments: throws when id is missing', async () => {
      try {
        await handleAppsCommand('deployments', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ID')
      }
    })

    test('list: throws for invalid status filter', async () => {
      try {
        await handleAppsCommand('list', [], { status: 'INVALID' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('INVALID_STATUS')
        expect((err as CliError).message).toContain('Invalid status')
      }
    })
  })
})
