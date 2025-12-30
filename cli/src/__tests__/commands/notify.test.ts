import { describe, test, expect } from 'bun:test'
import { handleNotifyCommand } from '../../commands/notify'
import { CliError, ExitCodes } from '../../utils/errors'

describe('notify command', () => {
  describe('validation errors', () => {
    test('throws when title is missing', async () => {
      try {
        await handleNotifyCommand([], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_TITLE')
        expect((err as CliError).exitCode).toBe(ExitCodes.INVALID_ARGS)
        expect((err as CliError).message).toContain('Title is required')
      }
    })

    test('accepts title from positional argument', async () => {
      try {
        await handleNotifyCommand(['Test Title'], {})
      } catch (err) {
        // Expected API error, not validation error
        expect((err as Error).message).not.toContain('Title is required')
      }
    })

    test('accepts title from --title flag', async () => {
      try {
        await handleNotifyCommand([], { title: 'Test Title' })
      } catch (err) {
        // Expected API error, not validation error
        expect((err as Error).message).not.toContain('Title is required')
      }
    })

    test('accepts title and message from positional arguments', async () => {
      try {
        await handleNotifyCommand(['Test Title', 'with', 'message'], {})
      } catch (err) {
        // Expected API error, not validation error
        expect((err as Error).message).not.toContain('is required')
      }
    })

    test('accepts title and message from flags', async () => {
      try {
        await handleNotifyCommand([], { title: 'Title', message: 'Message' })
      } catch (err) {
        // Expected API error, not validation error
        expect((err as Error).message).not.toContain('is required')
      }
    })
  })
})
