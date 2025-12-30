import { describe, test, expect } from 'bun:test'
import { handleHealthCommand } from '../../commands/health'

describe('health command', () => {
  test('does not require any arguments', async () => {
    // Health command just calls the API, no validation
    try {
      await handleHealthCommand({})
    } catch (err) {
      // Expected API error (server not running), not validation error
      expect((err as Error).message).not.toContain('is required')
    }
  })

  test('accepts --port flag', async () => {
    try {
      await handleHealthCommand({ port: '8080' })
    } catch (err) {
      expect((err as Error).message).not.toContain('is required')
    }
  })

  test('accepts --url flag', async () => {
    try {
      await handleHealthCommand({ url: 'http://localhost:3000' })
    } catch (err) {
      expect((err as Error).message).not.toContain('is required')
    }
  })
})
