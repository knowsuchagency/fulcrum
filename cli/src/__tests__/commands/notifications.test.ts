import { describe, test, expect } from 'bun:test'
import { handleNotificationsCommand } from '../../commands/notifications'
import { CliError, ExitCodes } from '../../utils/errors'

describe('notifications command', () => {
  describe('validation errors', () => {
    test('throws for unknown action', async () => {
      try {
        await handleNotificationsCommand('invalid', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('UNKNOWN_ACTION')
        expect((err as CliError).exitCode).toBe(ExitCodes.INVALID_ARGS)
        expect((err as CliError).message).toContain('Unknown action: invalid')
        expect((err as CliError).message).toContain('Valid: status, enable, disable, test, set')
      }
    })

    test('test: throws when channel is missing', async () => {
      try {
        await handleNotificationsCommand('test', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_CHANNEL')
        expect((err as CliError).message).toContain('Channel is required')
        expect((err as CliError).message).toContain('Valid: sound, slack, discord, pushover')
      }
    })

    test('test: throws for invalid channel', async () => {
      try {
        await handleNotificationsCommand('test', ['invalid'], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('INVALID_CHANNEL')
        expect((err as CliError).message).toContain('Invalid channel: invalid')
      }
    })

    test('set: throws when channel is missing', async () => {
      try {
        await handleNotificationsCommand('set', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_CHANNEL')
      }
    })

    test('set: throws for invalid channel', async () => {
      try {
        await handleNotificationsCommand('set', ['invalid', 'key', 'value'], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('INVALID_CHANNEL')
      }
    })

    test('set: throws when key is missing', async () => {
      try {
        await handleNotificationsCommand('set', ['slack'], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_KEY')
        expect((err as CliError).message).toContain('Setting key is required')
      }
    })

    test('set: throws when value is missing', async () => {
      try {
        await handleNotificationsCommand('set', ['slack', 'webhookUrl'], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_VALUE')
        expect((err as CliError).message).toContain('Setting value is required')
      }
    })

    test('status: shows current settings (no action required)', async () => {
      // undefined action defaults to status
      try {
        await handleNotificationsCommand(undefined, [], {})
      } catch (err) {
        // Expected API error, not validation error
        expect((err as Error).message).not.toContain('is required')
      }
    })

    test('enable: does not require any arguments', async () => {
      try {
        await handleNotificationsCommand('enable', [], {})
      } catch (err) {
        expect((err as Error).message).not.toContain('is required')
      }
    })

    test('disable: does not require any arguments', async () => {
      try {
        await handleNotificationsCommand('disable', [], {})
      } catch (err) {
        expect((err as Error).message).not.toContain('is required')
      }
    })
  })
})
