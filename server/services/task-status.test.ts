import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'
import { createTestGitRepo, type TestGitRepo } from '../__tests__/fixtures/git'
import { db, tasks } from '../db'
import { eq } from 'drizzle-orm'
import { updateTaskStatus } from './task-status'

describe('Task Status Service', () => {
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

  describe('updateTaskStatus', () => {
    test('returns null for non-existent task', async () => {
      const result = await updateTaskStatus('nonexistent', 'IN_REVIEW')
      expect(result).toBeNull()
    })

    test('updates task status in database', async () => {
      const now = new Date().toISOString()
      db.insert(tasks)
        .values({
          id: 'status-test-1',
          title: 'Status Test',
          status: 'IN_PROGRESS',
          position: 0,
          repoPath: repo.path,
          repoName: 'test-repo',
          baseBranch: repo.defaultBranch,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const result = await updateTaskStatus('status-test-1', 'IN_REVIEW')

      expect(result).not.toBeNull()
      expect(result!.status).toBe('IN_REVIEW')

      // Verify in database
      const dbTask = db.select().from(tasks).where(eq(tasks.id, 'status-test-1')).get()
      expect(dbTask?.status).toBe('IN_REVIEW')
    })

    test('updates position when provided', async () => {
      const now = new Date().toISOString()
      db.insert(tasks)
        .values({
          id: 'position-test-1',
          title: 'Position Test',
          status: 'IN_PROGRESS',
          position: 0,
          repoPath: repo.path,
          repoName: 'test-repo',
          baseBranch: repo.defaultBranch,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const result = await updateTaskStatus('position-test-1', 'IN_REVIEW', 5)

      expect(result).not.toBeNull()
      expect(result!.status).toBe('IN_REVIEW')
      expect(result!.position).toBe(5)
    })

    test('updates timestamp on status change', async () => {
      const oldTime = '2024-01-01T00:00:00.000Z'
      db.insert(tasks)
        .values({
          id: 'time-test-1',
          title: 'Time Test',
          status: 'IN_PROGRESS',
          position: 0,
          repoPath: repo.path,
          repoName: 'test-repo',
          baseBranch: repo.defaultBranch,
          createdAt: oldTime,
          updatedAt: oldTime,
        })
        .run()

      const result = await updateTaskStatus('time-test-1', 'DONE')

      expect(result).not.toBeNull()
      expect(result!.updatedAt).not.toBe(oldTime)
      expect(new Date(result!.updatedAt).getTime()).toBeGreaterThan(new Date(oldTime).getTime())
    })

    test('handles status transition from IN_PROGRESS to IN_REVIEW', async () => {
      const now = new Date().toISOString()
      db.insert(tasks)
        .values({
          id: 'transition-1',
          title: 'Transition Test',
          status: 'IN_PROGRESS',
          position: 0,
          repoPath: repo.path,
          repoName: 'test-repo',
          baseBranch: repo.defaultBranch,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const result = await updateTaskStatus('transition-1', 'IN_REVIEW')
      expect(result?.status).toBe('IN_REVIEW')
    })

    test('handles status transition from IN_REVIEW to DONE', async () => {
      const now = new Date().toISOString()
      db.insert(tasks)
        .values({
          id: 'transition-2',
          title: 'Transition Test 2',
          status: 'IN_REVIEW',
          position: 0,
          repoPath: repo.path,
          repoName: 'test-repo',
          baseBranch: repo.defaultBranch,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const result = await updateTaskStatus('transition-2', 'DONE')
      expect(result?.status).toBe('DONE')
    })

    test('handles status transition to CANCELED', async () => {
      const now = new Date().toISOString()
      db.insert(tasks)
        .values({
          id: 'cancel-1',
          title: 'Cancel Test',
          status: 'IN_PROGRESS',
          position: 0,
          repoPath: repo.path,
          repoName: 'test-repo',
          baseBranch: repo.defaultBranch,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const result = await updateTaskStatus('cancel-1', 'CANCELED')
      expect(result?.status).toBe('CANCELED')
    })

    test('same status update still updates timestamp', async () => {
      const oldTime = '2024-01-01T00:00:00.000Z'
      db.insert(tasks)
        .values({
          id: 'same-status-1',
          title: 'Same Status Test',
          status: 'IN_PROGRESS',
          position: 0,
          repoPath: repo.path,
          repoName: 'test-repo',
          baseBranch: repo.defaultBranch,
          createdAt: oldTime,
          updatedAt: oldTime,
        })
        .run()

      const result = await updateTaskStatus('same-status-1', 'IN_PROGRESS')

      expect(result).not.toBeNull()
      expect(result!.status).toBe('IN_PROGRESS')
      // Timestamp should still be updated even for same status
      expect(result!.updatedAt).not.toBe(oldTime)
    })
  })
})
