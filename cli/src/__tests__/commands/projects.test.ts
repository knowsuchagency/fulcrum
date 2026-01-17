import { describe, test, expect } from 'bun:test'
import { handleProjectsCommand } from '../../commands/projects'
import { CliError, ExitCodes } from '../../utils/errors'

describe('projects command', () => {
  describe('validation errors', () => {
    test('throws for unknown action', async () => {
      try {
        await handleProjectsCommand('invalid', [], {})
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
        await handleProjectsCommand('get', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ID')
        expect((err as CliError).message).toContain('Project ID required')
      }
    })

    test('create: throws when name is missing', async () => {
      try {
        await handleProjectsCommand('create', [], { path: '/some/path' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_NAME')
        expect((err as CliError).message).toContain('--name is required')
      }
    })

    test('create: throws when no source is provided', async () => {
      try {
        await handleProjectsCommand('create', [], { name: 'Test' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_SOURCE')
        expect((err as CliError).message).toContain('--repository-id, --path, or --url')
      }
    })

    test('create: throws when multiple sources are provided', async () => {
      try {
        await handleProjectsCommand('create', [], {
          name: 'Test',
          path: '/some/path',
          url: 'https://github.com/example/repo',
        })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('CONFLICTING_OPTIONS')
        expect((err as CliError).message).toContain('only one of')
      }
    })

    test('update: throws when id is missing', async () => {
      try {
        await handleProjectsCommand('update', [], { name: 'New Name' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ID')
      }
    })

    test('update: throws when no updates provided', async () => {
      try {
        await handleProjectsCommand('update', ['project-123'], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('NO_UPDATES')
        expect((err as CliError).message).toContain('No updates provided')
      }
    })

    test('update: throws for invalid status', async () => {
      try {
        await handleProjectsCommand('update', ['project-123'], { status: 'INVALID' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('INVALID_STATUS')
        expect((err as CliError).message).toContain('Invalid status')
      }
    })

    test('delete: throws when id is missing', async () => {
      try {
        await handleProjectsCommand('delete', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ID')
      }
    })

    test('list: throws for invalid status filter', async () => {
      try {
        await handleProjectsCommand('list', [], { status: 'INVALID' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('INVALID_STATUS')
        expect((err as CliError).message).toContain('Invalid status')
      }
    })
  })
})
