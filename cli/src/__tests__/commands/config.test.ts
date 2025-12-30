import { describe, test, expect } from 'bun:test'
import { handleConfigCommand } from '../../commands/config'
import { CliError, ExitCodes } from '../../utils/errors'

describe('config command', () => {
  describe('validation errors', () => {
    test('throws for unknown action', async () => {
      try {
        await handleConfigCommand('invalid', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('UNKNOWN_ACTION')
        expect((err as CliError).exitCode).toBe(ExitCodes.INVALID_ARGS)
        expect((err as CliError).message).toContain('Unknown action: invalid')
        expect((err as CliError).message).toContain('Valid: list, get, set, reset')
      }
    })

    test('get: throws when key is missing', async () => {
      try {
        await handleConfigCommand('get', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_KEY')
        expect((err as CliError).message).toContain('Config key is required')
      }
    })

    test('set: throws when key is missing', async () => {
      try {
        await handleConfigCommand('set', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_KEY')
        expect((err as CliError).message).toContain('Config key is required')
      }
    })

    test('set: throws when value is missing', async () => {
      try {
        await handleConfigCommand('set', ['port'], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_VALUE')
        expect((err as CliError).message).toContain('Config value is required')
      }
    })

    test('reset: throws when key is missing', async () => {
      try {
        await handleConfigCommand('reset', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_KEY')
        expect((err as CliError).message).toContain('Config key is required')
      }
    })
  })
})
