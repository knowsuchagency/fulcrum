import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestGitRepo, type TestGitRepo } from '../__tests__/fixtures/git'
import { createTestApp } from '../__tests__/fixtures/app'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'
import { db, tasks } from '../db'
import { eq } from 'drizzle-orm'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('Tasks Routes', () => {
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

  describe('GET /api/tasks', () => {
    test('returns empty array when no tasks exist', async () => {
      const { get } = createTestApp()
      const res = await get('/api/tasks')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toEqual([])
    })

    test('returns all tasks ordered by position', async () => {
      // Insert test tasks directly
      const now = new Date().toISOString()
      db.insert(tasks)
        .values([
          {
            id: 'task-1',
            title: 'First Task',
            status: 'IN_PROGRESS',
            position: 0,
            repoPath: repo.path,
            repoName: 'test-repo',
            baseBranch: repo.defaultBranch,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'task-2',
            title: 'Second Task',
            status: 'IN_PROGRESS',
            position: 1,
            repoPath: repo.path,
            repoName: 'test-repo',
            baseBranch: repo.defaultBranch,
            createdAt: now,
            updatedAt: now,
          },
        ])
        .run()

      const { get } = createTestApp()
      const res = await get('/api/tasks')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.length).toBe(2)
      expect(body[0].title).toBe('First Task')
      expect(body[1].title).toBe('Second Task')
    })
  })

  describe('POST /api/tasks', () => {
    test('creates a task without worktree', async () => {
      const { post } = createTestApp()

      const res = await post('/api/tasks', {
        title: 'New Task',
        repoPath: repo.path,
        repoName: 'test-repo',
        baseBranch: repo.defaultBranch,
      })
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.title).toBe('New Task')
      expect(body.status).toBe('IN_PROGRESS')
      expect(body.id).toBeDefined()
      expect(body.worktreePath).toBeNull()
    })

    test('creates a task with worktree', async () => {
      const worktreePath = mkdtempSync(join(tmpdir(), 'task-wt-'))
      rmSync(worktreePath, { recursive: true }) // Remove so git can create it

      try {
        const { post } = createTestApp()

        const res = await post('/api/tasks', {
          title: 'Task with Worktree',
          repoPath: repo.path,
          repoName: 'test-repo',
          baseBranch: repo.defaultBranch,
          branch: 'feature-task',
          worktreePath,
        })
        const body = await res.json()

        expect(res.status).toBe(201)
        expect(body.title).toBe('Task with Worktree')
        expect(body.worktreePath).toBe(worktreePath)
        expect(body.branch).toBe('feature-task')
        expect(existsSync(worktreePath)).toBe(true)
      } finally {
        // Cleanup worktree
        try {
          repo.git(`worktree remove "${worktreePath}" --force`)
        } catch {
          rmSync(worktreePath, { recursive: true, force: true })
        }
      }
    })

    test('assigns incrementing positions', async () => {
      const { post } = createTestApp()

      const res1 = await post('/api/tasks', {
        title: 'First',
        repoPath: repo.path,
        repoName: 'test-repo',
        baseBranch: repo.defaultBranch,
      })
      const body1 = await res1.json()

      const res2 = await post('/api/tasks', {
        title: 'Second',
        repoPath: repo.path,
        repoName: 'test-repo',
        baseBranch: repo.defaultBranch,
      })
      const body2 = await res2.json()

      expect(body1.position).toBe(0)
      expect(body2.position).toBe(1)
    })
  })

  describe('GET /api/tasks/:id', () => {
    test('returns task by id', async () => {
      const now = new Date().toISOString()
      db.insert(tasks)
        .values({
          id: 'test-task-123',
          title: 'Test Task',
          status: 'IN_PROGRESS',
          position: 0,
          repoPath: repo.path,
          repoName: 'test-repo',
          baseBranch: repo.defaultBranch,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { get } = createTestApp()
      const res = await get('/api/tasks/test-task-123')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.id).toBe('test-task-123')
      expect(body.title).toBe('Test Task')
    })

    test('returns 404 for non-existent task', async () => {
      const { get } = createTestApp()
      const res = await get('/api/tasks/nonexistent')
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toContain('not found')
    })
  })

  describe('PATCH /api/tasks/:id', () => {
    test('updates task title', async () => {
      const now = new Date().toISOString()
      db.insert(tasks)
        .values({
          id: 'update-task-1',
          title: 'Original Title',
          status: 'IN_PROGRESS',
          position: 0,
          repoPath: repo.path,
          repoName: 'test-repo',
          baseBranch: repo.defaultBranch,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/tasks/update-task-1', {
        title: 'Updated Title',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.title).toBe('Updated Title')
    })

    test('updates task status', async () => {
      const now = new Date().toISOString()
      db.insert(tasks)
        .values({
          id: 'status-task-1',
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

      const { patch } = createTestApp()
      const res = await patch('/api/tasks/status-task-1', {
        status: 'IN_REVIEW',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.status).toBe('IN_REVIEW')
    })

    test('returns 404 for non-existent task', async () => {
      const { patch } = createTestApp()
      const res = await patch('/api/tasks/nonexistent', {
        title: 'New Title',
      })

      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/tasks/:id', () => {
    test('deletes task', async () => {
      const now = new Date().toISOString()
      db.insert(tasks)
        .values({
          id: 'delete-task-1',
          title: 'To Delete',
          status: 'IN_PROGRESS',
          position: 0,
          repoPath: repo.path,
          repoName: 'test-repo',
          baseBranch: repo.defaultBranch,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { request } = createTestApp()
      const res = await request('/api/tasks/delete-task-1', {
        method: 'DELETE',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)

      // Verify task is deleted
      const deleted = db.select().from(tasks).where(eq(tasks.id, 'delete-task-1')).get()
      expect(deleted).toBeUndefined()
    })

    test('returns 404 for non-existent task', async () => {
      const { request } = createTestApp()
      const res = await request('/api/tasks/nonexistent', {
        method: 'DELETE',
      })

      expect(res.status).toBe(404)
    })

    test('shifts positions after deletion', async () => {
      const now = new Date().toISOString()
      db.insert(tasks)
        .values([
          {
            id: 'task-a',
            title: 'Task A',
            status: 'IN_PROGRESS',
            position: 0,
            repoPath: repo.path,
            repoName: 'test-repo',
            baseBranch: repo.defaultBranch,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'task-b',
            title: 'Task B',
            status: 'IN_PROGRESS',
            position: 1,
            repoPath: repo.path,
            repoName: 'test-repo',
            baseBranch: repo.defaultBranch,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'task-c',
            title: 'Task C',
            status: 'IN_PROGRESS',
            position: 2,
            repoPath: repo.path,
            repoName: 'test-repo',
            baseBranch: repo.defaultBranch,
            createdAt: now,
            updatedAt: now,
          },
        ])
        .run()

      // Delete middle task
      const { request } = createTestApp()
      await request('/api/tasks/task-b', { method: 'DELETE' })

      // Check positions shifted
      const taskA = db.select().from(tasks).where(eq(tasks.id, 'task-a')).get()
      const taskC = db.select().from(tasks).where(eq(tasks.id, 'task-c')).get()

      expect(taskA?.position).toBe(0)
      expect(taskC?.position).toBe(1)
    })
  })

  describe('DELETE /api/tasks/bulk', () => {
    test('deletes multiple tasks', async () => {
      const now = new Date().toISOString()
      db.insert(tasks)
        .values([
          {
            id: 'bulk-1',
            title: 'Bulk 1',
            status: 'IN_PROGRESS',
            position: 0,
            repoPath: repo.path,
            repoName: 'test-repo',
            baseBranch: repo.defaultBranch,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'bulk-2',
            title: 'Bulk 2',
            status: 'IN_PROGRESS',
            position: 1,
            repoPath: repo.path,
            repoName: 'test-repo',
            baseBranch: repo.defaultBranch,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'bulk-3',
            title: 'Bulk 3',
            status: 'IN_PROGRESS',
            position: 2,
            repoPath: repo.path,
            repoName: 'test-repo',
            baseBranch: repo.defaultBranch,
            createdAt: now,
            updatedAt: now,
          },
        ])
        .run()

      const { request } = createTestApp()
      const res = await request('/api/tasks/bulk', {
        method: 'DELETE',
        body: JSON.stringify({ ids: ['bulk-1', 'bulk-2'] }),
        headers: { 'Content-Type': 'application/json' },
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.deleted).toBe(2)

      // Verify tasks are deleted
      const remaining = db.select().from(tasks).all()
      expect(remaining.length).toBe(1)
      expect(remaining[0].id).toBe('bulk-3')
    })

    test('returns 400 for empty ids array', async () => {
      const { request } = createTestApp()
      const res = await request('/api/tasks/bulk', {
        method: 'DELETE',
        body: JSON.stringify({ ids: [] }),
        headers: { 'Content-Type': 'application/json' },
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('non-empty array')
    })
  })
})
