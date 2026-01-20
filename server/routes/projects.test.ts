import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTestApp } from '../__tests__/fixtures/app'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'
import { db, projects, repositories, apps, appServices } from '../db'
import { eq } from 'drizzle-orm'

describe('Projects Routes', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('GET /api/projects', () => {
    test('returns empty array when no projects exist', async () => {
      const { get } = createTestApp()
      const res = await get('/api/projects')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toEqual([])
    })

    test('returns all projects sorted by lastAccessedAt then createdAt', async () => {
      const now = new Date()
      const earlier = new Date(now.getTime() - 60000)
      const latest = new Date(now.getTime() + 60000)

      db.insert(projects)
        .values([
          {
            id: 'proj-1',
            name: 'Project 1',
            status: 'active',
            lastAccessedAt: earlier.toISOString(),
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
          {
            id: 'proj-2',
            name: 'Project 2',
            status: 'active',
            lastAccessedAt: latest.toISOString(),
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
          {
            id: 'proj-3',
            name: 'Project 3',
            status: 'active',
            lastAccessedAt: null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ])
        .run()

      const { get } = createTestApp()
      const res = await get('/api/projects')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.length).toBe(3)
      // proj-2 has latest lastAccessedAt, should be first
      expect(body[0].id).toBe('proj-2')
      expect(body[1].id).toBe('proj-1')
      // proj-3 has null lastAccessedAt, should be last
      expect(body[2].id).toBe('proj-3')
    })

    test('returns projects with nested repository data', async () => {
      const now = new Date().toISOString()

      db.insert(repositories)
        .values({
          id: 'repo-1',
          path: '/path/to/repo',
          displayName: 'Test Repo',
          startupScript: 'npm start',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(projects)
        .values({
          id: 'proj-1',
          name: 'Project 1',
          repositoryId: 'repo-1',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { get } = createTestApp()
      const res = await get('/api/projects')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body[0].repository).not.toBeNull()
      expect(body[0].repository.id).toBe('repo-1')
      expect(body[0].repository.displayName).toBe('Test Repo')
      expect(body[0].repository.startupScript).toBe('npm start')
    })
  })

  describe('GET /api/projects/:id', () => {
    test('returns project by id', async () => {
      const now = new Date().toISOString()
      db.insert(projects)
        .values({
          id: 'test-proj-123',
          name: 'Test Project',
          description: 'A test project',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { get } = createTestApp()
      const res = await get('/api/projects/test-proj-123')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.id).toBe('test-proj-123')
      expect(body.name).toBe('Test Project')
      expect(body.description).toBe('A test project')
    })

    test('returns 404 for non-existent project', async () => {
      const { get } = createTestApp()
      const res = await get('/api/projects/nonexistent')
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toContain('not found')
    })

    test('returns project with nested app and services', async () => {
      const now = new Date().toISOString()

      db.insert(repositories)
        .values({
          id: 'repo-1',
          path: '/path/to/repo',
          displayName: 'Test Repo',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(apps)
        .values({
          id: 'app-1',
          name: 'Test App',
          repositoryId: 'repo-1',
          branch: 'main',
          composeFile: 'docker-compose.yml',
          status: 'running',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(appServices)
        .values({
          id: 'svc-1',
          appId: 'app-1',
          serviceName: 'web',
          containerPort: 3000,
          exposed: true,
          domain: 'test.example.com',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(projects)
        .values({
          id: 'proj-1',
          name: 'Project 1',
          repositoryId: 'repo-1',
          appId: 'app-1',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { get } = createTestApp()
      const res = await get('/api/projects/proj-1')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.app).not.toBeNull()
      expect(body.app.id).toBe('app-1')
      expect(body.app.status).toBe('running')
      expect(body.app.services).toHaveLength(1)
      expect(body.app.services[0].serviceName).toBe('web')
      expect(body.app.services[0].domain).toBe('test.example.com')
    })
  })

  describe('POST /api/projects', () => {
    test('creates a project with existing repositoryId', async () => {
      const now = new Date().toISOString()
      const repoPath = join(testEnv.viboraDir, 'existing-repo')
      mkdirSync(repoPath, { recursive: true })

      db.insert(repositories)
        .values({
          id: 'existing-repo',
          path: repoPath,
          displayName: 'Existing Repo',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { post } = createTestApp()
      const res = await post('/api/projects', {
        name: 'New Project',
        description: 'A new project',
        repositoryId: 'existing-repo',
      })
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.name).toBe('New Project')
      expect(body.description).toBe('A new project')
      expect(body.repository.id).toBe('existing-repo')
    })

    test('creates a project with local path (creates repository)', async () => {
      const repoPath = join(testEnv.viboraDir, 'local-repo')
      mkdirSync(repoPath, { recursive: true })

      const { post } = createTestApp()
      const res = await post('/api/projects', {
        name: 'Local Project',
        path: repoPath,
      })
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.name).toBe('Local Project')
      expect(body.repository).not.toBeNull()
      expect(body.repository.path).toBe(repoPath)
      expect(body.repository.displayName).toBe('local-repo')
    })

    test('returns 400 when name is missing', async () => {
      const { post } = createTestApp()
      const res = await post('/api/projects', {
        path: '/some/path',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('name is required')
    })

    test('creates project without repository (standalone project)', async () => {
      const { post } = createTestApp()
      const res = await post('/api/projects', {
        name: 'No Repo Project',
      })
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.name).toBe('No Repo Project')
      expect(body.repositories).toEqual([]) // No repositories linked
    })

    test('returns 400 for non-existent directory', async () => {
      const { post } = createTestApp()
      const res = await post('/api/projects', {
        name: 'Ghost Project',
        path: '/nonexistent/path/to/repo',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('does not exist')
    })

    test('returns 400 for duplicate repository path', async () => {
      const now = new Date().toISOString()
      const repoPath = join(testEnv.viboraDir, 'dup-repo')
      mkdirSync(repoPath, { recursive: true })

      db.insert(repositories)
        .values({
          id: 'dup-repo',
          path: repoPath,
          displayName: 'Duplicate',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { post } = createTestApp()
      const res = await post('/api/projects', {
        name: 'Duplicate Project',
        path: repoPath,
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('already exists')
    })

    test('returns 404 for non-existent repositoryId', async () => {
      const { post } = createTestApp()
      const res = await post('/api/projects', {
        name: 'Missing Repo Project',
        repositoryId: 'nonexistent',
      })
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toContain('not found')
    })
  })

  describe('PATCH /api/projects/:id', () => {
    test('updates project name', async () => {
      const now = new Date().toISOString()
      db.insert(projects)
        .values({
          id: 'update-proj-1',
          name: 'Original Name',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/projects/update-proj-1', {
        name: 'Updated Name',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.name).toBe('Updated Name')
    })

    test('updates project description', async () => {
      const now = new Date().toISOString()
      db.insert(projects)
        .values({
          id: 'desc-proj',
          name: 'Description Project',
          description: null,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/projects/desc-proj', {
        description: 'A new description',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.description).toBe('A new description')
    })

    test('updates project status to archived', async () => {
      const now = new Date().toISOString()
      db.insert(projects)
        .values({
          id: 'archive-proj',
          name: 'Archive Project',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/projects/archive-proj', {
        status: 'archived',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.status).toBe('archived')
    })

    test('returns 404 for non-existent project', async () => {
      const { patch } = createTestApp()
      const res = await patch('/api/projects/nonexistent', {
        name: 'New Name',
      })

      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/projects/:id', () => {
    test('deletes project', async () => {
      const now = new Date().toISOString()
      const repoPath = join(testEnv.viboraDir, 'delete-repo')
      mkdirSync(repoPath, { recursive: true })

      db.insert(repositories)
        .values({
          id: 'delete-repo',
          path: repoPath,
          displayName: 'Delete Repo',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(projects)
        .values({
          id: 'delete-proj-1',
          name: 'To Delete',
          repositoryId: 'delete-repo',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { request } = createTestApp()
      const res = await request('/api/projects/delete-proj-1', {
        method: 'DELETE',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)

      // Verify project is deleted
      const deleted = db.select().from(projects).where(eq(projects.id, 'delete-proj-1')).get()
      expect(deleted).toBeUndefined()

      // Repository should still exist (becomes "unlinked")
      // Repos are not deleted with projects - they can be moved to other projects
      const repoStillExists = db.select().from(repositories).where(eq(repositories.id, 'delete-repo')).get()
      expect(repoStillExists).toBeDefined()
      expect(repoStillExists?.id).toBe('delete-repo')
    })

    test('deletes project with cascade to app', async () => {
      const now = new Date().toISOString()
      const repoPath = join(testEnv.viboraDir, 'cascade-repo')
      mkdirSync(repoPath, { recursive: true })

      db.insert(repositories)
        .values({
          id: 'cascade-repo',
          path: repoPath,
          displayName: 'Cascade Repo',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(apps)
        .values({
          id: 'cascade-app',
          name: 'Cascade App',
          repositoryId: 'cascade-repo',
          branch: 'main',
          composeFile: 'docker-compose.yml',
          status: 'stopped',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(appServices)
        .values({
          id: 'cascade-svc',
          appId: 'cascade-app',
          serviceName: 'web',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(projects)
        .values({
          id: 'cascade-proj',
          name: 'Cascade Project',
          repositoryId: 'cascade-repo',
          appId: 'cascade-app',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { request } = createTestApp()
      const res = await request('/api/projects/cascade-proj?deleteApp=true', {
        method: 'DELETE',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.deletedApp).toBe(true)

      // Verify app and services are deleted
      const appDeleted = db.select().from(apps).where(eq(apps.id, 'cascade-app')).get()
      expect(appDeleted).toBeUndefined()

      const svcDeleted = db.select().from(appServices).where(eq(appServices.id, 'cascade-svc')).get()
      expect(svcDeleted).toBeUndefined()
    })

    test('deletes project with directory deletion', async () => {
      const now = new Date().toISOString()
      const repoPath = join(testEnv.viboraDir, 'dir-delete-repo')
      const gitPath = join(repoPath, '.git')
      mkdirSync(gitPath, { recursive: true })

      db.insert(repositories)
        .values({
          id: 'dir-delete-repo',
          path: repoPath,
          displayName: 'Dir Delete Repo',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(projects)
        .values({
          id: 'dir-delete-proj',
          name: 'Dir Delete Project',
          repositoryId: 'dir-delete-repo',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { request } = createTestApp()
      const res = await request('/api/projects/dir-delete-proj?deleteDirectory=true', {
        method: 'DELETE',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.deletedDirectory).toBe(true)

      // Verify directory is deleted
      const { existsSync } = await import('node:fs')
      expect(existsSync(repoPath)).toBe(false)
    })

    test('returns 404 for non-existent project', async () => {
      const { request } = createTestApp()
      const res = await request('/api/projects/nonexistent', {
        method: 'DELETE',
      })
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toContain('not found')
    })
  })

  describe('POST /api/projects/:id/add-app', () => {
    test('adds existing app to project', async () => {
      const now = new Date().toISOString()
      const repoPath = join(testEnv.viboraDir, 'add-app-repo')
      mkdirSync(repoPath, { recursive: true })

      db.insert(repositories)
        .values({
          id: 'add-app-repo',
          path: repoPath,
          displayName: 'Add App Repo',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(apps)
        .values({
          id: 'add-app-1',
          name: 'Add App',
          repositoryId: 'add-app-repo',
          branch: 'main',
          composeFile: 'docker-compose.yml',
          status: 'stopped',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(projects)
        .values({
          id: 'add-app-proj',
          name: 'Add App Project',
          repositoryId: 'add-app-repo',
          appId: null,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { post } = createTestApp()
      const res = await post('/api/projects/add-app-proj/add-app', {
        appId: 'add-app-1',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.app).not.toBeNull()
      expect(body.app.id).toBe('add-app-1')
    })

    test('returns 400 if project already has an app', async () => {
      const now = new Date().toISOString()

      db.insert(projects)
        .values({
          id: 'has-app-proj',
          name: 'Has App Project',
          appId: 'existing-app',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { post } = createTestApp()
      const res = await post('/api/projects/has-app-proj/add-app', {
        appId: 'new-app',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('already has an app')
    })

    test('returns 404 for non-existent project', async () => {
      const { post } = createTestApp()
      const res = await post('/api/projects/nonexistent/add-app', {
        appId: 'some-app',
      })

      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/projects/:id/create-app', () => {
    test('creates app for project with compose file', async () => {
      const now = new Date().toISOString()
      const repoPath = join(testEnv.viboraDir, 'create-app-repo')
      mkdirSync(repoPath, { recursive: true })

      // Create a compose file
      writeFileSync(
        join(repoPath, 'docker-compose.yml'),
        'version: "3"\nservices:\n  web:\n    image: nginx\n    ports:\n      - "80:80"'
      )

      db.insert(repositories)
        .values({
          id: 'create-app-repo',
          path: repoPath,
          displayName: 'Create App Repo',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(projects)
        .values({
          id: 'create-app-proj',
          name: 'Create App Project',
          repositoryId: 'create-app-repo',
          appId: null,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { post } = createTestApp()
      const res = await post('/api/projects/create-app-proj/create-app', {
        name: 'New App',
        branch: 'main',
      })
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.app).not.toBeNull()
      expect(body.app.name).toBe('New App')
      expect(body.app.branch).toBe('main')
      expect(body.app.composeFile).toBe('docker-compose.yml')
    })

    test('returns 400 if project already has an app', async () => {
      const now = new Date().toISOString()

      db.insert(projects)
        .values({
          id: 'has-app-proj-2',
          name: 'Has App Project',
          repositoryId: 'some-repo',
          appId: 'existing-app',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { post } = createTestApp()
      const res = await post('/api/projects/has-app-proj-2/create-app', {
        name: 'New App',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('already has an app')
    })

    test('returns 400 if no compose file found', async () => {
      const now = new Date().toISOString()
      const repoPath = join(testEnv.viboraDir, 'no-compose-repo')
      mkdirSync(repoPath, { recursive: true })

      db.insert(repositories)
        .values({
          id: 'no-compose-repo',
          path: repoPath,
          displayName: 'No Compose Repo',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(projects)
        .values({
          id: 'no-compose-proj',
          name: 'No Compose Project',
          repositoryId: 'no-compose-repo',
          appId: null,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { post } = createTestApp()
      const res = await post('/api/projects/no-compose-proj/create-app', {
        name: 'New App',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('No compose file')
    })
  })

  describe('DELETE /api/projects/:id/app', () => {
    test('removes app from project without deleting', async () => {
      const now = new Date().toISOString()
      const repoPath = join(testEnv.viboraDir, 'remove-app-repo')
      mkdirSync(repoPath, { recursive: true })

      db.insert(repositories)
        .values({
          id: 'remove-app-repo',
          path: repoPath,
          displayName: 'Remove App Repo',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(apps)
        .values({
          id: 'remove-app-1',
          name: 'Remove App',
          repositoryId: 'remove-app-repo',
          branch: 'main',
          composeFile: 'docker-compose.yml',
          status: 'stopped',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(projects)
        .values({
          id: 'remove-app-proj',
          name: 'Remove App Project',
          repositoryId: 'remove-app-repo',
          appId: 'remove-app-1',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { request } = createTestApp()
      const res = await request('/api/projects/remove-app-proj/app', {
        method: 'DELETE',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.appDeleted).toBe(false)

      // App should still exist
      const app = db.select().from(apps).where(eq(apps.id, 'remove-app-1')).get()
      expect(app).toBeDefined()

      // Project should have no app
      const project = db.select().from(projects).where(eq(projects.id, 'remove-app-proj')).get()
      expect(project?.appId).toBeNull()
    })

    test('removes and deletes app from project', async () => {
      const now = new Date().toISOString()
      const repoPath = join(testEnv.viboraDir, 'delete-app-repo')
      mkdirSync(repoPath, { recursive: true })

      db.insert(repositories)
        .values({
          id: 'delete-app-repo',
          path: repoPath,
          displayName: 'Delete App Repo',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(apps)
        .values({
          id: 'delete-app-1',
          name: 'Delete App',
          repositoryId: 'delete-app-repo',
          branch: 'main',
          composeFile: 'docker-compose.yml',
          status: 'stopped',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(projects)
        .values({
          id: 'delete-app-proj',
          name: 'Delete App Project',
          repositoryId: 'delete-app-repo',
          appId: 'delete-app-1',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { request } = createTestApp()
      const res = await request('/api/projects/delete-app-proj/app?delete=true', {
        method: 'DELETE',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.appDeleted).toBe(true)

      // App should be deleted
      const app = db.select().from(apps).where(eq(apps.id, 'delete-app-1')).get()
      expect(app).toBeUndefined()
    })

    test('returns 400 if project has no app', async () => {
      const now = new Date().toISOString()

      db.insert(projects)
        .values({
          id: 'no-app-proj',
          name: 'No App Project',
          appId: null,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { request } = createTestApp()
      const res = await request('/api/projects/no-app-proj/app', {
        method: 'DELETE',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('does not have an app')
    })
  })

  describe('POST /api/projects/scan', () => {
    test('scans directory for git repositories', async () => {
      // Create test repos in viboraDir
      const repo1 = join(testEnv.viboraDir, 'scan-repo-1')
      const repo2 = join(testEnv.viboraDir, 'scan-repo-2')
      const nonRepo = join(testEnv.viboraDir, 'not-a-repo')

      mkdirSync(join(repo1, '.git'), { recursive: true })
      mkdirSync(join(repo2, '.git'), { recursive: true })
      mkdirSync(nonRepo, { recursive: true })

      const { post } = createTestApp()
      const res = await post('/api/projects/scan', {
        directory: testEnv.viboraDir,
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.directory).toBe(testEnv.viboraDir)
      expect(body.repositories.length).toBe(2)

      const names = body.repositories.map((r: { name: string }) => r.name)
      expect(names).toContain('scan-repo-1')
      expect(names).toContain('scan-repo-2')
      expect(names).not.toContain('not-a-repo')
    })

    test('indicates which repos have projects', async () => {
      const now = new Date().toISOString()
      const repoPath = join(testEnv.viboraDir, 'existing-proj-repo')
      mkdirSync(join(repoPath, '.git'), { recursive: true })

      db.insert(repositories)
        .values({
          id: 'existing-proj-repo',
          path: repoPath,
          displayName: 'Existing',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(projects)
        .values({
          id: 'existing-proj',
          name: 'Existing Project',
          repositoryId: 'existing-proj-repo',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { post } = createTestApp()
      const res = await post('/api/projects/scan', {
        directory: testEnv.viboraDir,
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      const existing = body.repositories.find((r: { name: string }) => r.name === 'existing-proj-repo')
      expect(existing).toBeDefined()
      expect(existing.hasRepository).toBe(true)
      expect(existing.hasProject).toBe(true)
    })
  })

  describe('POST /api/projects/bulk', () => {
    test('creates projects in bulk', async () => {
      const repo1 = join(testEnv.viboraDir, 'bulk-repo-1')
      const repo2 = join(testEnv.viboraDir, 'bulk-repo-2')
      mkdirSync(repo1, { recursive: true })
      mkdirSync(repo2, { recursive: true })

      const { post } = createTestApp()
      const res = await post('/api/projects/bulk', {
        repositories: [
          { path: repo1, displayName: 'Bulk Repo 1' },
          { path: repo2, displayName: 'Bulk Repo 2' },
        ],
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.created.length).toBe(2)
      expect(body.skipped).toBe(0)

      // Verify projects were created
      const proj1 = db.select().from(projects).where(eq(projects.name, 'Bulk Repo 1')).get()
      const proj2 = db.select().from(projects).where(eq(projects.name, 'Bulk Repo 2')).get()
      expect(proj1).toBeDefined()
      expect(proj2).toBeDefined()
    })

    test('skips non-existent paths', async () => {
      const repo1 = join(testEnv.viboraDir, 'exists-repo')
      mkdirSync(repo1, { recursive: true })

      const { post } = createTestApp()
      const res = await post('/api/projects/bulk', {
        repositories: [
          { path: repo1, displayName: 'Exists' },
          { path: '/nonexistent/path' },
        ],
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.created.length).toBe(1)
      expect(body.skipped).toBe(1)
    })

    test('skips repositories that already have projects', async () => {
      const now = new Date().toISOString()
      const repoPath = join(testEnv.viboraDir, 'already-has-proj')
      mkdirSync(repoPath, { recursive: true })

      db.insert(repositories)
        .values({
          id: 'already-has-proj',
          path: repoPath,
          displayName: 'Already Has',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(projects)
        .values({
          id: 'already-proj',
          name: 'Already',
          repositoryId: 'already-has-proj',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { post } = createTestApp()
      const res = await post('/api/projects/bulk', {
        repositories: [{ path: repoPath }],
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.created.length).toBe(0)
      expect(body.skipped).toBe(1)
    })
  })

  describe('POST /api/projects/:id/access', () => {
    test('updates lastAccessedAt timestamp', async () => {
      const now = new Date().toISOString()
      db.insert(projects)
        .values({
          id: 'access-proj',
          name: 'Access Project',
          status: 'active',
          lastAccessedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { post } = createTestApp()
      const res = await post('/api/projects/access-proj/access', {})
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)

      // Verify timestamp was updated
      const project = db.select().from(projects).where(eq(projects.id, 'access-proj')).get()
      expect(project?.lastAccessedAt).not.toBeNull()
    })

    test('returns 404 for non-existent project', async () => {
      const { post } = createTestApp()
      const res = await post('/api/projects/nonexistent/access', {})

      expect(res.status).toBe(404)
    })
  })
})
