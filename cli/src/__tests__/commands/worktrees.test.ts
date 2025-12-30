import { describe, test, expect } from 'bun:test'
import { handleWorktreesCommand } from '../../commands/worktrees'
import { CliError, ExitCodes } from '../../utils/errors'

describe('worktrees command', () => {
  describe('validation errors', () => {
    test('throws for unknown action', async () => {
      try {
        await handleWorktreesCommand('invalid', {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('UNKNOWN_ACTION')
        expect((err as CliError).exitCode).toBe(ExitCodes.INVALID_ARGS)
        expect((err as CliError).message).toContain('Unknown action: invalid')
        expect((err as CliError).message).toContain('Valid: list, delete')
      }
    })

    test('delete: throws when --path is missing', async () => {
      try {
        await handleWorktreesCommand('delete', {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_PATH')
        expect((err as CliError).message).toContain('--path is required')
      }
    })

    test('list: does not require any arguments', async () => {
      // This will fail with API error, but should not throw validation error
      try {
        await handleWorktreesCommand('list', {})
      } catch (err) {
        expect((err as Error).message).not.toContain('is required')
      }
    })
  })
})
