import { describe, test, expect } from 'bun:test'
import { handleGitCommand } from '../../commands/git'
import { CliError, ExitCodes } from '../../utils/errors'

describe('git command', () => {
  describe('validation errors', () => {
    test('throws for unknown action', async () => {
      try {
        await handleGitCommand('invalid', {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('UNKNOWN_ACTION')
        expect((err as CliError).exitCode).toBe(ExitCodes.INVALID_ARGS)
        expect((err as CliError).message).toContain('Unknown action: invalid')
        expect((err as CliError).message).toContain('Valid: status, diff, branches')
      }
    })

    test('branches: throws when --repo is missing', async () => {
      try {
        await handleGitCommand('branches', {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_REPO')
        expect((err as CliError).message).toContain('--repo is required')
      }
    })

    test('status: defaults to process.cwd() when path not provided', async () => {
      // This would make a real API call, so we just verify it doesn't throw validation error
      // The actual API call will fail, but that's expected without a running server
      try {
        await handleGitCommand('status', {})
      } catch (err) {
        // Expected to fail with API error, not validation error
        expect((err as Error).message).not.toContain('is required')
      }
    })

    test('diff: defaults to process.cwd() when path not provided', async () => {
      try {
        await handleGitCommand('diff', {})
      } catch (err) {
        // Expected to fail with API error, not validation error
        expect((err as Error).message).not.toContain('is required')
      }
    })
  })
})
