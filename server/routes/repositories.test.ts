import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createTestApp } from '../__tests__/fixtures/app'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'
import { db, repositories, projects } from '../db'
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

    test('returns agent options as parsed JSON', async () => {
      const now = new Date().toISOString()
      db.insert(repositories)
        .values({
          id: 'json-repo',
          path: '/path/to/json',
          displayName: 'JSON Repo',
          claudeOptions: JSON.stringify({ model: 'claude-3-opus' }),
          opencodeOptions: JSON.stringify({ model: 'gpt-4', temperature: '0.7' }),
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { get } = createTestApp()
      const res = await get('/api/repositories/json-repo')
      const body = await res.json()

      expect(res.status).toBe(200)
      // Should be parsed objects, not JSON strings
      expect(body.claudeOptions).toEqual({ model: 'claude-3-opus' })
      expect(body.opencodeOptions).toEqual({ model: 'gpt-4', temperature: '0.7' })
      expect(typeof body.claudeOptions).toBe('object')
      expect(typeof body.opencodeOptions).toBe('object')
    })
  })

  describe('POST /api/repositories', () => {
    test('creates repository from valid path', async () => {
      // Create a real git repo directory
      const repoPath = join(testEnv.viboraDir, 'test-git-repo')
      mkdirSync(repoPath, { recursive: true })
      mkdirSync(join(repoPath, '.git'), { recursive: true })

      const { post } = createTestApp()
      const res = await post('/api/repositories', {
        path: repoPath,
        displayName: 'Test Git Repo',
      })
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.id).toBeDefined()
      expect(body.path).toBe(repoPath)
      expect(body.displayName).toBe('Test Git Repo')
    })

    test('defaults displayName to folder name', async () => {
      const repoPath = join(testEnv.viboraDir, 'my-custom-repo')
      mkdirSync(repoPath, { recursive: true })
      mkdirSync(join(repoPath, '.git'), { recursive: true })

      const { post } = createTestApp()
      const res = await post('/api/repositories', {
        path: repoPath,
      })
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.displayName).toBe('my-custom-repo')
    })

    test('returns 400 when path is missing', async () => {
      const { post } = createTestApp()
      const res = await post('/api/repositories', {
        displayName: 'No Path',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('path is required')
    })

    test('returns 400 for non-existent directory', async () => {
      const { post } = createTestApp()
      const res = await post('/api/repositories', {
        path: '/nonexistent/path/to/repo',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('does not exist')
    })

    test('returns 400 for non-git directory', async () => {
      const nonGitPath = join(testEnv.viboraDir, 'non-git-dir')
      mkdirSync(nonGitPath, { recursive: true })

      const { post } = createTestApp()
      const res = await post('/api/repositories', {
        path: nonGitPath,
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('not a git repository')
    })

    test('returns 409 for duplicate path', async () => {
      const repoPath = join(testEnv.viboraDir, 'duplicate-repo')
      mkdirSync(repoPath, { recursive: true })
      mkdirSync(join(repoPath, '.git'), { recursive: true })

      const now = new Date().toISOString()
      db.insert(repositories)
        .values({
          id: 'existing-repo',
          path: repoPath,
          displayName: 'Existing',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { post } = createTestApp()
      const res = await post('/api/repositories', {
        path: repoPath,
      })
      const body = await res.json()

      expect(res.status).toBe(409)
      expect(body.error).toContain('already exists')
      expect(body.existingId).toBe('existing-repo')
    })
  })

  describe('GET /api/repositories with filters', () => {
    test('returns orphan repositories when orphans=true', async () => {
      const now = new Date().toISOString()
      // Create repositories
      db.insert(repositories)
        .values([
          {
            id: 'orphan-repo',
            path: '/path/to/orphan',
            displayName: 'Orphan Repo',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'linked-repo',
            path: '/path/to/linked',
            displayName: 'Linked Repo',
            createdAt: now,
            updatedAt: now,
          },
        ])
        .run()

      // Link one to a project
      db.insert(projects)
        .values({
          id: 'test-project',
          name: 'Test Project',
          repositoryId: 'linked-repo',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { get } = createTestApp()
      const res = await get('/api/repositories?orphans=true')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.length).toBe(1)
      expect(body[0].id).toBe('orphan-repo')
    })

    test('returns repositories for specific project when projectId specified', async () => {
      const now = new Date().toISOString()
      // Create repositories
      db.insert(repositories)
        .values([
          {
            id: 'project-a-repo',
            path: '/path/to/project-a',
            displayName: 'Project A Repo',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'project-b-repo',
            path: '/path/to/project-b',
            displayName: 'Project B Repo',
            createdAt: now,
            updatedAt: now,
          },
        ])
        .run()

      // Create projects with repos
      db.insert(projects)
        .values([
          {
            id: 'project-a',
            name: 'Project A',
            repositoryId: 'project-a-repo',
            status: 'active',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'project-b',
            name: 'Project B',
            repositoryId: 'project-b-repo',
            status: 'active',
            createdAt: now,
            updatedAt: now,
          },
        ])
        .run()

      const { get } = createTestApp()
      const res = await get('/api/repositories?projectId=project-a')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.length).toBe(1)
      expect(body[0].id).toBe('project-a-repo')
    })
  })

  describe('POST /api/repositories/clone (deprecated)', () => {
    test('returns 400 with deprecation message', async () => {
      const { post } = createTestApp()
      const res = await post('/api/repositories/clone', {
        url: 'https://github.com/user/repo',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('not supported')
      expect(body.error).toContain('POST /api/projects')
    })
  })

  describe('POST /api/repositories/bulk (deprecated)', () => {
    test('returns 400 with deprecation message', async () => {
      const { post } = createTestApp()
      const res = await post('/api/repositories/bulk', {
        repositories: [{ path: '/some/path' }],
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('not supported')
      expect(body.error).toContain('POST /api/projects/bulk')
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
      // Create real directories
      const oldPath = join(testEnv.viboraDir, 'old-path')
      const newPath = join(testEnv.viboraDir, 'new-path')
      mkdirSync(oldPath, { recursive: true })
      mkdirSync(newPath, { recursive: true })

      const now = new Date().toISOString()
      db.insert(repositories)
        .values({
          id: 'path-repo',
          path: oldPath,
          displayName: 'Path Repo',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/repositories/path-repo', {
        path: newPath,
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.path).toBe(newPath)
    })

    test('returns 400 when updating path to non-existent directory', async () => {
      // Create only the original directory
      const oldPath = join(testEnv.viboraDir, 'original-path')
      mkdirSync(oldPath, { recursive: true })

      const now = new Date().toISOString()
      db.insert(repositories)
        .values({
          id: 'path-check-repo',
          path: oldPath,
          displayName: 'Path Check Repo',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/repositories/path-check-repo', {
        path: '/nonexistent/path',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('does not exist')
    })

    test('returns 404 for non-existent repository', async () => {
      const { patch } = createTestApp()
      const res = await patch('/api/repositories/nonexistent', {
        displayName: 'New Name',
      })

      expect(res.status).toBe(404)
    })

    test('updates claudeOptions', async () => {
      const now = new Date().toISOString()
      db.insert(repositories)
        .values({
          id: 'claude-opts-repo',
          path: '/path/to/claude-opts',
          displayName: 'Claude Options Repo',
          claudeOptions: JSON.stringify({ model: 'claude-3-sonnet' }),
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/repositories/claude-opts-repo', {
        claudeOptions: { model: 'claude-3-opus', 'max-tokens': '8000' },
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.claudeOptions).toEqual({ model: 'claude-3-opus', 'max-tokens': '8000' })
    })

    test('updates opencodeOptions', async () => {
      const now = new Date().toISOString()
      db.insert(repositories)
        .values({
          id: 'opencode-opts-repo',
          path: '/path/to/opencode-opts',
          displayName: 'OpenCode Options Repo',
          opencodeOptions: JSON.stringify({ model: 'gpt-4' }),
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/repositories/opencode-opts-repo', {
        opencodeOptions: { model: 'gpt-4-turbo', temperature: '0.5' },
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.opencodeOptions).toEqual({ model: 'gpt-4-turbo', temperature: '0.5' })
    })

    test('updates opencodeOptions independently from claudeOptions', async () => {
      const now = new Date().toISOString()
      db.insert(repositories)
        .values({
          id: 'both-opts-repo',
          path: '/path/to/both-opts',
          displayName: 'Both Options Repo',
          claudeOptions: JSON.stringify({ model: 'claude-3-sonnet' }),
          opencodeOptions: JSON.stringify({ model: 'gpt-4' }),
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      // Update only opencodeOptions
      const res = await patch('/api/repositories/both-opts-repo', {
        opencodeOptions: { model: 'gpt-4-turbo' },
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      // opencodeOptions should be updated
      expect(body.opencodeOptions).toEqual({ model: 'gpt-4-turbo' })
      // claudeOptions should remain unchanged
      expect(body.claudeOptions).toEqual({ model: 'claude-3-sonnet' })
    })

    test('clears agent options when set to null', async () => {
      const now = new Date().toISOString()
      db.insert(repositories)
        .values({
          id: 'clear-opts-repo',
          path: '/path/to/clear-opts',
          displayName: 'Clear Options Repo',
          claudeOptions: JSON.stringify({ model: 'claude-3-sonnet' }),
          opencodeOptions: JSON.stringify({ model: 'gpt-4' }),
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/repositories/clear-opts-repo', {
        claudeOptions: null,
        opencodeOptions: null,
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.claudeOptions).toBeNull()
      expect(body.opencodeOptions).toBeNull()
    })

    test('returns 400 when changing path to duplicate', async () => {
      // Create real directories
      const pathOne = join(testEnv.viboraDir, 'path-one')
      const pathTwo = join(testEnv.viboraDir, 'path-two')
      mkdirSync(pathOne, { recursive: true })
      mkdirSync(pathTwo, { recursive: true })

      const now = new Date().toISOString()
      db.insert(repositories)
        .values([
          {
            id: 'dup-repo-1',
            path: pathOne,
            displayName: 'Repo One',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'dup-repo-2',
            path: pathTwo,
            displayName: 'Repo Two',
            createdAt: now,
            updatedAt: now,
          },
        ])
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/repositories/dup-repo-2', {
        path: pathOne, // Duplicate of repo-1
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('already exists')
    })
  })

  describe('DELETE /api/repositories/:id', () => {
    test('deletes orphaned repository (no project reference)', async () => {
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

    test('returns 400 when repository is linked to a project', async () => {
      const now = new Date().toISOString()
      db.insert(repositories)
        .values({
          id: 'linked-repo',
          path: '/path/to/linked',
          displayName: 'Linked Repo',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(projects)
        .values({
          id: 'linked-project',
          name: 'Linked Project',
          repositoryId: 'linked-repo',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { request } = createTestApp()
      const res = await request('/api/repositories/linked-repo', {
        method: 'DELETE',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('linked to a project')
      expect(body.projectId).toBe('linked-project')

      // Verify repository is NOT deleted
      const repo = db.select().from(repositories).where(eq(repositories.id, 'linked-repo')).get()
      expect(repo).toBeDefined()
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
