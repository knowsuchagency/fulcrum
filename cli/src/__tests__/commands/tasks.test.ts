import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { handleTasksCommand } from '../../commands/tasks'
import { CliError, ExitCodes } from '../../utils/errors'
import { setupTestEnv, type TestEnv } from '../../../../server/__tests__/utils/env'
import { createTestGitRepo, type TestGitRepo } from '../../../../server/__tests__/fixtures/git'

let testEnv: TestEnv
let repo: TestGitRepo

beforeEach(() => {
  testEnv = setupTestEnv()
  repo = createTestGitRepo()
})

afterEach(() => {
  repo.cleanup()
  testEnv.cleanup()
})

describe('tasks command', () => {
  describe('validation errors', () => {
    test('throws for unknown action', async () => {
      try {
        await handleTasksCommand('invalid', [], {})
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
        await handleTasksCommand('get', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ID')
        expect((err as CliError).message).toContain('Task ID required')
      }
    })

    test('create: throws when title is missing', async () => {
      try {
        await handleTasksCommand('create', [], { repo: '/path' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_TITLE')
        expect((err as CliError).message).toContain('--title is required')
      }
    })

    test('create: throws when repo is missing', async () => {
      try {
        await handleTasksCommand('create', [], { title: 'Test' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_REPO')
        expect((err as CliError).message).toContain('--repo is required')
      }
    })

    test('update: throws when id is missing', async () => {
      try {
        await handleTasksCommand('update', [], { title: 'New Title' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ID')
      }
    })

    test('update: throws when no updates provided', async () => {
      try {
        await handleTasksCommand('update', ['task-123'], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('NO_UPDATES')
        expect((err as CliError).message).toContain('No updates provided')
      }
    })

    test('move: throws when id is missing', async () => {
      try {
        await handleTasksCommand('move', [], { status: 'IN_REVIEW' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ID')
      }
    })

    test('move: throws for invalid status', async () => {
      try {
        await handleTasksCommand('move', ['task-123'], { status: 'INVALID' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('INVALID_STATUS')
        expect((err as CliError).message).toContain('--status is required')
      }
    })

    test('move: throws when status is missing', async () => {
      try {
        await handleTasksCommand('move', ['task-123'], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('INVALID_STATUS')
      }
    })

    test('delete: throws when id is missing', async () => {
      try {
        await handleTasksCommand('delete', [], {})
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('MISSING_ID')
      }
    })

    test('list: throws for invalid status filter', async () => {
      try {
        await handleTasksCommand('list', [], { status: 'INVALID' })
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(CliError)
        expect((err as CliError).code).toBe('INVALID_STATUS')
        expect((err as CliError).message).toContain('Invalid status')
      }
    })
  })
})
