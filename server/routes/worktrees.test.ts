import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestApp } from '../__tests__/fixtures/app'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'
import { createTestGitRepo, createTestWorktree, type TestGitRepo } from '../__tests__/fixtures/git'
import { insertTestTask, db } from '../__tests__/fixtures/db'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getWorktreeBasePath } from '../lib/settings'

describe('Worktrees Routes', () => {
  let testEnv: TestEnv
  let repo: TestGitRepo

  beforeEach(() => {
    testEnv = setupTestEnv()
    repo = createTestGitRepo()

    // Create the worktree base path directory
    const basePath = getWorktreeBasePath()
    mkdirSync(basePath, { recursive: true })
  })

  afterEach(() => {
    repo.cleanup()
    testEnv.cleanup()
  })

  describe('GET /api/worktrees/json', () => {
    test('returns empty array when no worktrees exist', async () => {
      const { get } = createTestApp()
      const res = await get('/api/worktrees/json')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.worktrees).toEqual([])
      expect(body.summary.total).toBe(0)
      expect(body.summary.orphaned).toBe(0)
    })

    test('returns worktrees with summary', async () => {
      const basePath = getWorktreeBasePath()

      // Create a worktree in the base path
      const wt = createTestWorktree(repo, 'test-worktree')

      // Move it to the base path
      const wtPath = join(basePath, 'test-worktree')
      rmSync(wtPath, { recursive: true, force: true })
      repo.git(`worktree move "${wt.path}" "${wtPath}"`)

      const { get } = createTestApp()
      const res = await get('/api/worktrees/json')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.worktrees.length).toBeGreaterThanOrEqual(1)
      expect(body.summary.total).toBeGreaterThanOrEqual(1)

      // All should be orphaned since no task is linked
      expect(body.summary.orphaned).toBe(body.summary.total)
    })

    test('identifies linked worktrees', async () => {
      const basePath = getWorktreeBasePath()

      // Create worktree
      const wt = createTestWorktree(repo, 'linked-worktree')
      const wtPath = join(basePath, 'linked-worktree')
      rmSync(wtPath, { recursive: true, force: true })
      repo.git(`worktree move "${wt.path}" "${wtPath}"`)

      // Create a linked task
      await insertTestTask({
        title: 'Linked Task',
        repoPath: repo.path,
        worktreePath: wtPath,
      })

      const { get } = createTestApp()
      const res = await get('/api/worktrees/json')
      const body = await res.json()

      expect(res.status).toBe(200)

      const linkedWt = body.worktrees.find((w: { path: string }) => w.path === wtPath)
      expect(linkedWt).toBeDefined()
      expect(linkedWt.isOrphaned).toBe(false)
      expect(linkedWt.taskTitle).toBe('Linked Task')
    })

    test('includes size and branch info', async () => {
      const basePath = getWorktreeBasePath()

      // Create worktree with some content
      const wt = createTestWorktree(repo, 'with-content')
      const wtPath = join(basePath, 'with-content')
      rmSync(wtPath, { recursive: true, force: true })
      repo.git(`worktree move "${wt.path}" "${wtPath}"`)

      // Add a file to have some size
      writeFileSync(join(wtPath, 'test.txt'), 'Some content')

      const { get } = createTestApp()
      const res = await get('/api/worktrees/json')
      const body = await res.json()

      expect(res.status).toBe(200)

      const foundWt = body.worktrees.find((w: { path: string }) => w.path === wtPath)
      expect(foundWt).toBeDefined()
      expect(foundWt.size).toBeGreaterThanOrEqual(0)
      expect(foundWt.sizeFormatted).toBeDefined()
      expect(foundWt.branch).toBeDefined()
    })

    test('sorts orphaned worktrees first', async () => {
      const basePath = getWorktreeBasePath()

      // Create two worktrees
      const wt1 = createTestWorktree(repo, 'orphaned-wt')
      const wt2 = createTestWorktree(repo, 'linked-wt')

      const wt1Path = join(basePath, 'orphaned-wt')
      const wt2Path = join(basePath, 'linked-wt')

      rmSync(wt1Path, { recursive: true, force: true })
      rmSync(wt2Path, { recursive: true, force: true })

      repo.git(`worktree move "${wt1.path}" "${wt1Path}"`)
      repo.git(`worktree move "${wt2.path}" "${wt2Path}"`)

      // Link only wt2
      await insertTestTask({
        title: 'Linked',
        repoPath: repo.path,
        worktreePath: wt2Path,
      })

      const { get } = createTestApp()
      const res = await get('/api/worktrees/json')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.worktrees.length).toBe(2)

      // Orphaned should come first
      expect(body.worktrees[0].isOrphaned).toBe(true)
      expect(body.worktrees[1].isOrphaned).toBe(false)
    })
  })

  describe('DELETE /api/worktrees', () => {
    test('returns 400 when worktreePath is missing', async () => {
      const { request } = createTestApp()
      const res = await request('/api/worktrees', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('worktreePath is required')
    })

    test('returns 400 for invalid worktree path', async () => {
      const { request } = createTestApp()
      const res = await request('/api/worktrees', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worktreePath: '/tmp/some/random/path',
        }),
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('Invalid worktree path')
    })

    test('returns 404 for non-existent worktree', async () => {
      const basePath = getWorktreeBasePath()
      const { request } = createTestApp()
      const res = await request('/api/worktrees', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worktreePath: join(basePath, 'nonexistent'),
        }),
      })
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toContain('not found')
    })

    test('deletes orphaned worktree', async () => {
      const basePath = getWorktreeBasePath()

      // Create worktree
      const wt = createTestWorktree(repo, 'to-delete')
      const wtPath = join(basePath, 'to-delete')
      rmSync(wtPath, { recursive: true, force: true })
      repo.git(`worktree move "${wt.path}" "${wtPath}"`)

      const { request } = createTestApp()
      const res = await request('/api/worktrees', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worktreePath: wtPath,
          repoPath: repo.path,
        }),
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.path).toBe(wtPath)
    })

    test('clears worktreePath from linked task when not deleting task', async () => {
      const basePath = getWorktreeBasePath()

      // Create worktree
      const wt = createTestWorktree(repo, 'linked-delete')
      const wtPath = join(basePath, 'linked-delete')
      rmSync(wtPath, { recursive: true, force: true })
      repo.git(`worktree move "${wt.path}" "${wtPath}"`)

      // Create linked task
      const task = await insertTestTask({
        title: 'Linked Task',
        repoPath: repo.path,
        worktreePath: wtPath,
      })

      const { request } = createTestApp()
      const res = await request('/api/worktrees', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worktreePath: wtPath,
          repoPath: repo.path,
          deleteLinkedTask: false,
        }),
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.deletedTaskId).toBeUndefined()

      // Verify task still exists but worktreePath is cleared
      const { tasks } = await import('../db')
      const { eq } = await import('drizzle-orm')
      const updatedTask = db.select().from(tasks).where(eq(tasks.id, task.id)).get()
      expect(updatedTask).toBeDefined()
      expect(updatedTask!.worktreePath).toBeNull()
    })

    test('deletes linked task when deleteLinkedTask is true', async () => {
      const basePath = getWorktreeBasePath()

      // Create worktree
      const wt = createTestWorktree(repo, 'delete-with-task')
      const wtPath = join(basePath, 'delete-with-task')
      rmSync(wtPath, { recursive: true, force: true })
      repo.git(`worktree move "${wt.path}" "${wtPath}"`)

      // Create linked task
      const task = await insertTestTask({
        title: 'Task to Delete',
        repoPath: repo.path,
        worktreePath: wtPath,
      })

      const { request } = createTestApp()
      const res = await request('/api/worktrees', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worktreePath: wtPath,
          repoPath: repo.path,
          deleteLinkedTask: true,
        }),
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.deletedTaskId).toBe(task.id)

      // Verify task is deleted
      const { tasks } = await import('../db')
      const { eq } = await import('drizzle-orm')
      const deletedTask = db.select().from(tasks).where(eq(tasks.id, task.id)).get()
      expect(deletedTask).toBeUndefined()
    })
  })

  // Note: The SSE endpoint (GET /api/worktrees) is harder to test because it streams events
  // We test the JSON endpoint which provides the same data synchronously
})
