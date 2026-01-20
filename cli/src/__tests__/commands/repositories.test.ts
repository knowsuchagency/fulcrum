import { describe, test, expect } from 'bun:test'
import { handleRepositoriesCommand } from '../../commands/repositories'
import { CliError, ExitCodes } from '../../utils/errors'

describe('repositories command', () => {
  describe('validation errors', () => {
    test('throws for unknown action', async () => {
      try {
        await handleRepositoriesCommand('invalid', [], {})
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
        await handleRepositoriesCommand('get', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ID')
        expect((err as CliError).message).toContain('Repository ID required')
      }
    })

    test('add: throws when path is missing', async () => {
      try {
        await handleRepositoriesCommand('add', [], { 'display-name': 'Test' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_PATH')
        expect((err as CliError).message).toContain('--path is required')
      }
    })

    test('update: throws when id is missing', async () => {
      try {
        await handleRepositoriesCommand('update', [], { 'display-name': 'New Name' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ID')
      }
    })

    test('update: throws when no updates provided', async () => {
      try {
        await handleRepositoriesCommand('update', ['repo-123'], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('NO_UPDATES')
        expect((err as CliError).message).toContain('No updates provided')
      }
    })

    test('update: throws for invalid agent', async () => {
      try {
        await handleRepositoriesCommand('update', ['repo-123'], { 'default-agent': 'INVALID' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('INVALID_AGENT')
        expect((err as CliError).message).toContain('Invalid agent')
      }
    })

    test('delete: throws when id is missing', async () => {
      try {
        await handleRepositoriesCommand('delete', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ID')
      }
    })

    test('link: throws when repo-id is missing', async () => {
      try {
        await handleRepositoriesCommand('link', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_REPO_ID')
        expect((err as CliError).message).toContain('Repository ID required')
      }
    })

    test('link: throws when project-id is missing', async () => {
      try {
        await handleRepositoriesCommand('link', ['repo-123'], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_PROJECT_ID')
        expect((err as CliError).message).toContain('Project ID required')
      }
    })

    test('unlink: throws when repo-id is missing', async () => {
      try {
        await handleRepositoriesCommand('unlink', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_REPO_ID')
      }
    })

    test('unlink: throws when project-id is missing', async () => {
      try {
        await handleRepositoriesCommand('unlink', ['repo-123'], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_PROJECT_ID')
      }
    })
  })
})
