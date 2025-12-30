import { mock } from 'bun:test'
import type { ViboraClient } from '../../client'

/**
 * Creates a mock ViboraClient for testing CLI commands.
 * All methods are mocked and can be configured per test.
 */
export function createMockClient(): {
  client: ViboraClient
  mocks: Record<string, ReturnType<typeof mock>>
} {
  const mocks: Record<string, ReturnType<typeof mock>> = {
    health: mock(() => Promise.resolve({ status: 'ok' })),
    listTasks: mock(() => Promise.resolve([])),
    getTask: mock(() => Promise.resolve({ id: 'test', title: 'Test Task' })),
    createTask: mock(() => Promise.resolve({ id: 'new', title: 'New Task' })),
    updateTask: mock(() => Promise.resolve({ id: 'test', title: 'Updated' })),
    moveTask: mock(() => Promise.resolve({ id: 'test', status: 'IN_REVIEW' })),
    deleteTask: mock(() => Promise.resolve({ success: true })),
    getBranches: mock(() => Promise.resolve({ branches: [], current: 'main' })),
    getDiff: mock(() => Promise.resolve({ diff: '' })),
    getStatus: mock(() => Promise.resolve({ status: 'clean' })),
    listWorktrees: mock(() => Promise.resolve({ worktrees: [] })),
    deleteWorktree: mock(() => Promise.resolve({ success: true, path: '/test' })),
    getConfig: mock(() => Promise.resolve({ key: 'test', value: 'value' })),
    setConfig: mock(() => Promise.resolve({ key: 'test', value: 'new' })),
    resetConfig: mock(() => Promise.resolve({ key: 'test', value: null })),
    getNotifications: mock(() => Promise.resolve({ enabled: false })),
    updateNotifications: mock(() => Promise.resolve({ enabled: true })),
    testNotification: mock(() => Promise.resolve({ success: true })),
    sendNotification: mock(() => Promise.resolve({ success: true, results: [] })),
  }

  const client = Object.fromEntries(
    Object.entries(mocks).map(([key, fn]) => [key, fn])
  ) as unknown as ViboraClient

  return { client, mocks }
}

/**
 * Captures console output for testing.
 */
export function captureOutput(): {
  logs: string[]
  errors: string[]
  restore: () => void
} {
  const logs: string[] = []
  const errors: string[] = []
  const originalLog = console.log
  const originalError = console.error

  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '))
  }
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '))
  }

  return {
    logs,
    errors,
    restore: () => {
      console.log = originalLog
      console.error = originalError
    },
  }
}
