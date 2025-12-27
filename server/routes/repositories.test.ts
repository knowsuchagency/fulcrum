import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestApp } from '../__tests__/fixtures/app'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'
import { db, repositories } from '../db'
import { eq } from 'drizzle-orm'

describe('Repositories Routes', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('GET /api/repositories', () => {
    test('returns empty array when no repositories exist', async () => {
      const { get } = createTestApp()
      const res = await get('/api/repositories')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toEqual([])
    })

    test('returns all repositories sorted by lastUsedAt then createdAt', async () => {
      const now = new Date()
      const earlier = new Date(now.getTime() - 60000)
      const latest = new Date(now.getTime() + 60000)

      db.insert(repositories)
        .values([
          {
            id: 'repo-1',
            path: '/path/to/repo1',
            displayName: 'Repo 1',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            lastUsedAt: earlier.toISOString(),
          },
          {
            id: 'repo-2',
            path: '/path/to/repo2',
            displayName: 'Repo 2',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            lastUsedAt: latest.toISOString(),
          },
          {
            id: 'repo-3',
            path: '/path/to/repo3',
            displayName: 'Repo 3',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            lastUsedAt: null,
          },
        ])
        .run()

      const { get } = createTestApp()
      const res = await get('/api/repositories')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.length).toBe(3)
      // repo-2 has latest lastUsedAt, should be first
      expect(body[0].id).toBe('repo-2')
      expect(body[1].id).toBe('repo-1')
      // repo-3 has null lastUsedAt, should be last
      expect(body[2].id).toBe('repo-3')
    })
  })

  describe('GET /api/repositories/:id', () => {
    test('returns repository by id', async () => {
      const now = new Date().toISOString()
      db.insert(repositories)
        .values({
          id: 'test-repo-123',
          path: '/path/to/test',
          displayName: 'Test Repository',
          startupScript: 'npm start',
          copyFiles: '*.md',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { get } = createTestApp()
      const res = await get('/api/repositories/test-repo-123')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.id).toBe('test-repo-123')
      expect(body.displayName).toBe('Test Repository')
      expect(body.path).toBe('/path/to/test')
      expect(body.startupScript).toBe('npm start')
      expect(body.copyFiles).toBe('*.md')
    })

    test('returns 404 for non-existent repository', async () => {
      const { get } = createTestApp()
      const res = await get('/api/repositories/nonexistent')
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toContain('not found')
    })
  })

  describe('POST /api/repositories', () => {
    test('creates a repository with required fields', async () => {
      const { post } = createTestApp()
      const res = await post('/api/repositories', {
        path: '/path/to/new/repo',
        displayName: 'New Repository',
      })
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.path).toBe('/path/to/new/repo')
      expect(body.displayName).toBe('New Repository')
      expect(body.id).toBeDefined()
      expect(body.startupScript).toBeNull()
      expect(body.copyFiles).toBeNull()
    })

    test('creates a repository with optional fields', async () => {
      const { post } = createTestApp()
      const res = await post('/api/repositories', {
        path: '/path/to/repo',
        displayName: 'Full Repository',
        startupScript: 'bun run dev',
        copyFiles: '.env.example\nREADME.md',
        isCopierTemplate: true,
      })
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.startupScript).toBe('bun run dev')
      expect(body.copyFiles).toBe('.env.example\nREADME.md')
      expect(body.isCopierTemplate).toBe(true)
    })

    test('derives displayName from path if not provided', async () => {
      const { post } = createTestApp()
      const res = await post('/api/repositories', {
        path: '/path/to/my-project',
        displayName: '',
      })
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.displayName).toBe('my-project')
    })

    test('returns 400 when path is missing', async () => {
      const { post } = createTestApp()
      const res = await post('/api/repositories', {
        displayName: 'No Path Repo',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('path is required')
    })

    test('returns 400 for duplicate path', async () => {
      const now = new Date().toISOString()
      db.insert(repositories)
        .values({
          id: 'existing-repo',
          path: '/existing/path',
          displayName: 'Existing',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { post } = createTestApp()
      const res = await post('/api/repositories', {
        path: '/existing/path',
        displayName: 'Duplicate',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('already exists')
    })
  })

  describe('PATCH /api/repositories/:id', () => {
    test('updates repository displayName', async () => {
      const now = new Date().toISOString()
      db.insert(repositories)
        .values({
          id: 'update-repo-1',
          path: '/path/to/update',
          displayName: 'Original Name',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/repositories/update-repo-1', {
        displayName: 'Updated Name',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.displayName).toBe('Updated Name')
      expect(body.path).toBe('/path/to/update')
    })

    test('updates repository startupScript', async () => {
      const now = new Date().toISOString()
      db.insert(repositories)
        .values({
          id: 'script-repo',
          path: '/path/to/script',
          displayName: 'Script Repo',
          startupScript: null,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/repositories/script-repo', {
        startupScript: 'npm run dev',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.startupScript).toBe('npm run dev')
    })

    test('updates repository path', async () => {
      const now = new Date().toISOString()
      db.insert(repositories)
        .values({
          id: 'path-repo',
          path: '/old/path',
          displayName: 'Path Repo',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/repositories/path-repo', {
        path: '/new/path',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.path).toBe('/new/path')
    })

    test('returns 404 for non-existent repository', async () => {
      const { patch } = createTestApp()
      const res = await patch('/api/repositories/nonexistent', {
        displayName: 'New Name',
      })

      expect(res.status).toBe(404)
    })

    test('returns 400 when changing path to duplicate', async () => {
      const now = new Date().toISOString()
      db.insert(repositories)
        .values([
          {
            id: 'dup-repo-1',
            path: '/path/one',
            displayName: 'Repo One',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'dup-repo-2',
            path: '/path/two',
            displayName: 'Repo Two',
            createdAt: now,
            updatedAt: now,
          },
        ])
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/repositories/dup-repo-2', {
        path: '/path/one', // Duplicate of repo-1
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('already exists')
    })
  })

  describe('DELETE /api/repositories/:id', () => {
    test('deletes repository', async () => {
      const now = new Date().toISOString()
      db.insert(repositories)
        .values({
          id: 'delete-repo-1',
          path: '/path/to/delete',
          displayName: 'To Delete',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { request } = createTestApp()
      const res = await request('/api/repositories/delete-repo-1', {
        method: 'DELETE',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)

      // Verify repository is deleted
      const deleted = db.select().from(repositories).where(eq(repositories.id, 'delete-repo-1')).get()
      expect(deleted).toBeUndefined()
    })

    test('returns 404 for non-existent repository', async () => {
      const { request } = createTestApp()
      const res = await request('/api/repositories/nonexistent', {
        method: 'DELETE',
      })
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toContain('not found')
    })
  })
})
