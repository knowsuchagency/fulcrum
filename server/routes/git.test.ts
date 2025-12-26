import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestGitRepo, createTestWorktree, type TestGitRepo } from '../__tests__/fixtures/git'
import { createTestApp } from '../__tests__/fixtures/app'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('Git Routes', () => {
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

  describe('GET /api/git/branches', () => {
    test('returns branches for valid repo', async () => {
      const { get } = createTestApp()

      const res = await get(`/api/git/branches?repo=${repo.path}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.branches).toContain(repo.defaultBranch)
      expect(body.current).toBe(repo.defaultBranch)
    })

    test('includes newly created branches', async () => {
      repo.createBranch('feature-branch')
      repo.checkout(repo.defaultBranch)

      const { get } = createTestApp()
      const res = await get(`/api/git/branches?repo=${repo.path}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.branches).toContain('feature-branch')
      expect(body.branches).toContain(repo.defaultBranch)
    })

    test('returns current branch correctly', async () => {
      repo.createBranch('active-branch')
      // createBranch checks out the new branch

      const { get } = createTestApp()
      const res = await get(`/api/git/branches?repo=${repo.path}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.current).toBe('active-branch')
    })

    test('returns 400 when repo parameter is missing', async () => {
      const { get } = createTestApp()
      const res = await get('/api/git/branches')
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('repo parameter is required')
    })

    test('returns 404 for non-existent path', async () => {
      const { get } = createTestApp()
      const res = await get('/api/git/branches?repo=/nonexistent/path')
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toContain('does not exist')
    })

    test('returns 400 for non-git directory', async () => {
      const notGitDir = mkdtempSync(join(tmpdir(), 'not-git-'))

      try {
        const { get } = createTestApp()
        const res = await get(`/api/git/branches?repo=${notGitDir}`)
        const body = await res.json()

        expect(res.status).toBe(400)
        expect(body.error).toContain('not a git repository')
      } finally {
        rmSync(notGitDir, { recursive: true, force: true })
      }
    })
  })

  describe('GET /api/git/diff', () => {
    test('returns empty diff for clean worktree', async () => {
      const { get } = createTestApp()
      const res = await get(`/api/git/diff?path=${repo.path}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.diff).toBe('')
      expect(body.files).toEqual([])
    })

    test('shows modified file in diff', async () => {
      repo.addFile('README.md', '# Updated Content\n')

      const { get } = createTestApp()
      const res = await get(`/api/git/diff?path=${repo.path}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.diff).toContain('Updated Content')
      expect(body.files.length).toBeGreaterThan(0)

      // Find the modified file - path is already trimmed by the API
      const modifiedFiles = body.files.filter((f: { status: string }) => f.status === 'modified')
      expect(modifiedFiles.length).toBeGreaterThan(0)
    })

    test('shows untracked files when includeUntracked=true', async () => {
      repo.addFile('new-file.txt', 'New content\n')

      const { get } = createTestApp()
      const res = await get(`/api/git/diff?path=${repo.path}&includeUntracked=true`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.files.some((f: { path: string }) => f.path === 'new-file.txt')).toBe(true)
    })

    test('returns 400 when path parameter is missing', async () => {
      const { get } = createTestApp()
      const res = await get('/api/git/diff')
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('path parameter is required')
    })

    test('returns 404 for non-existent path', async () => {
      const { get } = createTestApp()
      const res = await get('/api/git/diff?path=/nonexistent/path')
      const body = await res.json()

      expect(res.status).toBe(404)
    })

    test('staged diff only shows staged changes', async () => {
      repo.addFile('staged.txt', 'Staged content\n')
      repo.stage('staged.txt')
      repo.addFile('unstaged.txt', 'Unstaged content\n')

      const { get } = createTestApp()

      // Staged diff should show staged.txt
      const stagedRes = await get(`/api/git/diff?path=${repo.path}&staged=true`)
      const stagedBody = await stagedRes.json()

      expect(stagedBody.diff).toContain('Staged content')
      expect(stagedBody.diff).not.toContain('Unstaged content')
    })
  })

  describe('POST /api/git/worktree', () => {
    test('creates worktree with new branch', async () => {
      const worktreePath = mkdtempSync(join(tmpdir(), 'wt-test-'))
      rmSync(worktreePath, { recursive: true }) // Remove so git can create it

      try {
        const { post } = createTestApp()
        const res = await post('/api/git/worktree', {
          repoPath: repo.path,
          worktreePath,
          branch: 'feature-test',
          baseBranch: repo.defaultBranch,
        })
        const body = await res.json()

        expect(res.status).toBe(201)
        expect(body.success).toBe(true)
        expect(body.worktreePath).toBe(worktreePath)
        expect(body.branch).toBe('feature-test')
        expect(existsSync(worktreePath)).toBe(true)
        expect(existsSync(join(worktreePath, '.git'))).toBe(true)
      } finally {
        // Cleanup worktree
        try {
          repo.git(`worktree remove "${worktreePath}" --force`)
        } catch {
          rmSync(worktreePath, { recursive: true, force: true })
        }
      }
    })

    test('returns 400 for missing required fields', async () => {
      const { post } = createTestApp()
      const res = await post('/api/git/worktree', {
        repoPath: repo.path,
        // Missing worktreePath, branch, baseBranch
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('Missing required fields')
    })

    test('returns 404 for non-existent repo', async () => {
      const { post } = createTestApp()
      const res = await post('/api/git/worktree', {
        repoPath: '/nonexistent/repo',
        worktreePath: '/tmp/wt',
        branch: 'test',
        baseBranch: 'main',
      })
      const body = await res.json()

      expect(res.status).toBe(404)
    })

    test('returns 409 if worktree path already exists', async () => {
      const worktreePath = mkdtempSync(join(tmpdir(), 'existing-wt-'))

      try {
        const { post } = createTestApp()
        const res = await post('/api/git/worktree', {
          repoPath: repo.path,
          worktreePath,
          branch: 'test',
          baseBranch: repo.defaultBranch,
        })
        const body = await res.json()

        expect(res.status).toBe(409)
        expect(body.error).toContain('already exists')
      } finally {
        rmSync(worktreePath, { recursive: true, force: true })
      }
    })
  })

  describe('DELETE /api/git/worktree', () => {
    test('removes existing worktree', async () => {
      // Create a worktree first
      const wt = createTestWorktree(repo, 'to-delete')

      expect(existsSync(wt.path)).toBe(true)

      const { request } = createTestApp()
      const res = await request('/api/git/worktree', {
        method: 'DELETE',
        body: JSON.stringify({
          repoPath: repo.path,
          worktreePath: wt.path,
        }),
        headers: { 'Content-Type': 'application/json' },
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(existsSync(wt.path)).toBe(false)
    })

    test('returns 400 for missing required fields', async () => {
      const { request } = createTestApp()
      const res = await request('/api/git/worktree', {
        method: 'DELETE',
        body: JSON.stringify({
          repoPath: repo.path,
          // Missing worktreePath
        }),
        headers: { 'Content-Type': 'application/json' },
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('Missing required fields')
    })

    test('returns 404 for non-existent repo', async () => {
      const { request } = createTestApp()
      const res = await request('/api/git/worktree', {
        method: 'DELETE',
        body: JSON.stringify({
          repoPath: '/nonexistent/repo',
          worktreePath: '/tmp/wt',
        }),
        headers: { 'Content-Type': 'application/json' },
      })
      const body = await res.json()

      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/git/status', () => {
    test('returns clean status for repo with no changes', async () => {
      const { get } = createTestApp()
      const res = await get(`/api/git/status?path=${repo.path}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.clean).toBe(true)
      expect(body.branch).toBe(repo.defaultBranch)
    })

    test('returns dirty status when files are modified', async () => {
      repo.addFile('README.md', '# Modified\n')

      const { get } = createTestApp()
      const res = await get(`/api/git/status?path=${repo.path}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.clean).toBe(false)
      expect(body.files.length).toBeGreaterThan(0)
    })

    test('returns 400 when path parameter is missing', async () => {
      const { get } = createTestApp()
      const res = await get('/api/git/status')
      const body = await res.json()

      expect(res.status).toBe(400)
    })
  })

})
