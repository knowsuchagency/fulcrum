import { describe, test, expect } from 'bun:test'
import { handleFsCommand } from '../../commands/fs'
import { CliError, ExitCodes } from '../../utils/errors'

describe('fs command', () => {
  describe('validation errors', () => {
    test('throws for unknown action', async () => {
      try {
        await handleFsCommand('invalid', [], {})
        expect(true).toBe(false) // Should not reach here
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('UNKNOWN_ACTION')
        expect((err as CliError).exitCode).toBe(ExitCodes.INVALID_ARGS)
        expect((err as CliError).message).toContain('Unknown action: invalid')
      }
    })

    test('tree: throws when root is missing', async () => {
      try {
        await handleFsCommand('tree', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ROOT')
        expect((err as CliError).message).toContain('--root is required')
      }
    })

    test('read: throws when path is missing', async () => {
      try {
        await handleFsCommand('read', [], { root: '/some/root' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_PATH')
        expect((err as CliError).message).toContain('--path is required')
      }
    })

    test('read: throws when root is missing', async () => {
      try {
        await handleFsCommand('read', [], { path: 'file.txt' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ROOT')
        expect((err as CliError).message).toContain('--root is required')
      }
    })

    test('write: throws when path is missing', async () => {
      try {
        await handleFsCommand('write', [], { root: '/some/root', content: 'data' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_PATH')
        expect((err as CliError).message).toContain('--path is required')
      }
    })

    test('write: throws when root is missing', async () => {
      try {
        await handleFsCommand('write', [], { path: 'file.txt', content: 'data' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ROOT')
        expect((err as CliError).message).toContain('--root is required')
      }
    })

    test('write: throws when content is missing', async () => {
      try {
        await handleFsCommand('write', [], { path: 'file.txt', root: '/some/root' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_CONTENT')
        expect((err as CliError).message).toContain('--content is required')
      }
    })

    test('stat: throws when path is missing', async () => {
      try {
        await handleFsCommand('stat', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_PATH')
        expect((err as CliError).message).toContain('--path is required')
      }
    })

    test('is-git-repo: throws when path is missing', async () => {
      try {
        await handleFsCommand('is-git-repo', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_PATH')
        expect((err as CliError).message).toContain('--path is required')
      }
    })
  })
})
