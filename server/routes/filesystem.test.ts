import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestApp } from '../__tests__/fixtures/app'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'
import { createTestGitRepo } from '../__tests__/fixtures/git'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

describe('Filesystem Routes', () => {
  let testEnv: TestEnv
  let tempDir: string

  beforeEach(() => {
    testEnv = setupTestEnv()
    tempDir = mkdtempSync(join(tmpdir(), 'fs-test-'))
  })

  afterEach(() => {
    testEnv.cleanup()
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('GET /api/fs/list', () => {
    test('lists directory contents', async () => {
      // Create some files and directories
      mkdirSync(join(tempDir, 'subdir'))
      writeFileSync(join(tempDir, 'file.txt'), 'test content')

      const { get } = createTestApp()
      const res = await get(`/api/fs/list?path=${tempDir}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.path).toBe(tempDir)
      expect(body.entries).toBeInstanceOf(Array)

      const dirEntry = body.entries.find((e: { name: string }) => e.name === 'subdir')
      expect(dirEntry).toBeDefined()
      expect(dirEntry.type).toBe('directory')

      const fileEntry = body.entries.find((e: { name: string }) => e.name === 'file.txt')
      expect(fileEntry).toBeDefined()
      expect(fileEntry.type).toBe('file')
    })

    test('returns parent path', async () => {
      const subdir = join(tempDir, 'subdir')
      mkdirSync(subdir)

      const { get } = createTestApp()
      const res = await get(`/api/fs/list?path=${subdir}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.parent).toBe(tempDir)
    })

    test('defaults to home directory when no path provided', async () => {
      const { get } = createTestApp()
      const res = await get('/api/fs/list')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.path).toBe(homedir())
    })

    test('expands tilde to home directory', async () => {
      const { get } = createTestApp()
      const res = await get('/api/fs/list?path=~')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.path).toBe(homedir())
    })

    test('returns 404 for non-existent path', async () => {
      const { get } = createTestApp()
      const res = await get('/api/fs/list?path=/nonexistent/path')
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toContain('does not exist')
    })

    test('returns 400 for file path instead of directory', async () => {
      const filePath = join(tempDir, 'file.txt')
      writeFileSync(filePath, 'content')

      const { get } = createTestApp()
      const res = await get(`/api/fs/list?path=${filePath}`)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('not a directory')
    })

    test('skips hidden files', async () => {
      writeFileSync(join(tempDir, '.hidden'), 'hidden')
      writeFileSync(join(tempDir, 'visible.txt'), 'visible')

      const { get } = createTestApp()
      const res = await get(`/api/fs/list?path=${tempDir}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      const hiddenEntry = body.entries.find((e: { name: string }) => e.name === '.hidden')
      expect(hiddenEntry).toBeUndefined()

      const visibleEntry = body.entries.find((e: { name: string }) => e.name === 'visible.txt')
      expect(visibleEntry).toBeDefined()
    })

    test('identifies git repositories', async () => {
      const gitRepoDir = join(tempDir, 'git-repo')
      mkdirSync(gitRepoDir)
      mkdirSync(join(gitRepoDir, '.git'))

      const { get } = createTestApp()
      const res = await get(`/api/fs/list?path=${tempDir}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      const repoEntry = body.entries.find((e: { name: string }) => e.name === 'git-repo')
      expect(repoEntry).toBeDefined()
      expect(repoEntry.isGitRepo).toBe(true)
    })

    test('sorts directories before files', async () => {
      writeFileSync(join(tempDir, 'aaa-file.txt'), '')
      mkdirSync(join(tempDir, 'zzz-dir'))

      const { get } = createTestApp()
      const res = await get(`/api/fs/list?path=${tempDir}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      // Directory should come before file even though it sorts later alphabetically
      const dirIndex = body.entries.findIndex((e: { name: string }) => e.name === 'zzz-dir')
      const fileIndex = body.entries.findIndex((e: { name: string }) => e.name === 'aaa-file.txt')
      expect(dirIndex).toBeLessThan(fileIndex)
    })
  })

  describe('GET /api/fs/tree', () => {
    test('returns directory tree', async () => {
      mkdirSync(join(tempDir, 'level1'))
      mkdirSync(join(tempDir, 'level1', 'level2'))
      writeFileSync(join(tempDir, 'level1', 'level2', 'file.txt'), 'content')

      const { get } = createTestApp()
      const res = await get(`/api/fs/tree?root=${tempDir}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.root).toBe(tempDir)
      expect(body.entries).toBeInstanceOf(Array)

      const level1 = body.entries.find((e: { name: string }) => e.name === 'level1')
      expect(level1).toBeDefined()
      expect(level1.type).toBe('directory')
      expect(level1.children).toBeInstanceOf(Array)

      const level2 = level1.children.find((e: { name: string }) => e.name === 'level2')
      expect(level2).toBeDefined()
    })

    test('returns 400 when root parameter is missing', async () => {
      const { get } = createTestApp()
      const res = await get('/api/fs/tree')
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('root parameter is required')
    })

    test('returns 404 for non-existent root', async () => {
      const { get } = createTestApp()
      const res = await get('/api/fs/tree?root=/nonexistent/path')
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toContain('does not exist')
    })

    test('returns 400 for file path as root', async () => {
      const filePath = join(tempDir, 'file.txt')
      writeFileSync(filePath, 'content')

      const { get } = createTestApp()
      const res = await get(`/api/fs/tree?root=${filePath}`)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('not a directory')
    })

    test('excludes node_modules directory', async () => {
      mkdirSync(join(tempDir, 'node_modules'))
      writeFileSync(join(tempDir, 'node_modules', 'package.json'), '{}')
      mkdirSync(join(tempDir, 'src'))

      const { get } = createTestApp()
      const res = await get(`/api/fs/tree?root=${tempDir}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      const nodeModules = body.entries.find((e: { name: string }) => e.name === 'node_modules')
      expect(nodeModules).toBeUndefined()

      const src = body.entries.find((e: { name: string }) => e.name === 'src')
      expect(src).toBeDefined()
    })
  })

  describe('GET /api/fs/read', () => {
    test('reads file content', async () => {
      writeFileSync(join(tempDir, 'test.txt'), 'Hello, World!')

      const { get } = createTestApp()
      const res = await get(`/api/fs/read?path=test.txt&root=${tempDir}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.content).toBe('Hello, World!')
      expect(body.mimeType).toBe('text/plain')
      expect(body.truncated).toBe(false)
    })

    test('returns correct mime type for TypeScript', async () => {
      writeFileSync(join(tempDir, 'test.ts'), 'const x = 1')

      const { get } = createTestApp()
      const res = await get(`/api/fs/read?path=test.ts&root=${tempDir}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.mimeType).toBe('text/typescript')
    })

    test('returns correct mime type for JSON', async () => {
      writeFileSync(join(tempDir, 'test.json'), '{"key": "value"}')

      const { get } = createTestApp()
      const res = await get(`/api/fs/read?path=test.json&root=${tempDir}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.mimeType).toBe('application/json')
    })

    test('truncates large files', async () => {
      // Create file with more than 5 lines
      const content = Array(10).fill('Line').join('\n')
      writeFileSync(join(tempDir, 'large.txt'), content)

      const { get } = createTestApp()
      const res = await get(`/api/fs/read?path=large.txt&root=${tempDir}&maxLines=5`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.truncated).toBe(true)
      expect(body.lineCount).toBe(10)
    })

    test('returns 400 when path parameter is missing', async () => {
      const { get } = createTestApp()
      const res = await get(`/api/fs/read?root=${tempDir}`)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('path parameter is required')
    })

    test('returns 400 when root parameter is missing', async () => {
      const { get } = createTestApp()
      const res = await get('/api/fs/read?path=test.txt')
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('root parameter is required')
    })

    test('returns 404 for non-existent file', async () => {
      const { get } = createTestApp()
      const res = await get(`/api/fs/read?path=nonexistent.txt&root=${tempDir}`)
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toContain('not found')
    })

    test('returns 400 for directory instead of file', async () => {
      mkdirSync(join(tempDir, 'subdir'))

      const { get } = createTestApp()
      const res = await get(`/api/fs/read?path=subdir&root=${tempDir}`)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('not a file')
    })

    test('blocks path traversal attacks', async () => {
      const { get } = createTestApp()
      const res = await get(`/api/fs/read?path=../../../etc/passwd&root=${tempDir}`)
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toContain('Access denied')
    })

    test('reads image files as base64', async () => {
      // Create a minimal PNG file (1x1 pixel)
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
        0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
        0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59,
        0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND chunk
        0x44, 0xae, 0x42, 0x60, 0x82
      ])
      writeFileSync(join(tempDir, 'test.png'), pngBuffer)

      const { get } = createTestApp()
      const res = await get(`/api/fs/read?path=test.png&root=${tempDir}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.mimeType).toBe('image/png')
      expect(body.content).toMatch(/^data:image\/png;base64,/)
    })

    test('handles binary files', async () => {
      // Create a file with null bytes
      const binaryBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00])
      writeFileSync(join(tempDir, 'binary.bin'), binaryBuffer)

      const { get } = createTestApp()
      const res = await get(`/api/fs/read?path=binary.bin&root=${tempDir}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.mimeType).toBe('application/octet-stream')
      expect(body.content).toBe('')
    })
  })

  describe('GET /api/fs/image', () => {
    test('returns image as raw data', async () => {
      // Create a minimal PNG file
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
        0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59,
        0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
        0x44, 0xae, 0x42, 0x60, 0x82
      ])
      writeFileSync(join(tempDir, 'test.png'), pngBuffer)

      const { get } = createTestApp()
      const res = await get(`/api/fs/image?path=test.png&root=${tempDir}`)

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('image/png')
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600')
    })

    test('returns 400 for non-image file', async () => {
      writeFileSync(join(tempDir, 'test.txt'), 'not an image')

      const { get } = createTestApp()
      const res = await get(`/api/fs/image?path=test.txt&root=${tempDir}`)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('Not an image file')
    })

    test('blocks path traversal', async () => {
      const { get } = createTestApp()
      const res = await get(`/api/fs/image?path=../../../etc/passwd&root=${tempDir}`)
      await res.json() // consume body

      expect(res.status).toBe(403)
    })
  })

  describe('POST /api/fs/write', () => {
    test('writes content to existing file', async () => {
      writeFileSync(join(tempDir, 'test.txt'), 'original')

      const { post } = createTestApp()
      const res = await post('/api/fs/write', {
        path: 'test.txt',
        root: tempDir,
        content: 'updated content',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)

      // Verify content was written
      const { readFileSync } = await import('node:fs')
      const content = readFileSync(join(tempDir, 'test.txt'), 'utf-8')
      expect(content).toBe('updated content')
    })

    test('returns 400 when path is missing', async () => {
      const { post } = createTestApp()
      const res = await post('/api/fs/write', {
        root: tempDir,
        content: 'test',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('path is required')
    })

    test('returns 400 when root is missing', async () => {
      const { post } = createTestApp()
      const res = await post('/api/fs/write', {
        path: 'test.txt',
        content: 'test',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('root is required')
    })

    test('returns 400 when content is missing', async () => {
      const { post } = createTestApp()
      const res = await post('/api/fs/write', {
        path: 'test.txt',
        root: tempDir,
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('content is required')
    })

    test('returns 404 for non-existent file', async () => {
      const { post } = createTestApp()
      const res = await post('/api/fs/write', {
        path: 'nonexistent.txt',
        root: tempDir,
        content: 'test',
      })
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toContain('not found')
    })

    test('blocks path traversal attacks', async () => {
      const { post } = createTestApp()
      const res = await post('/api/fs/write', {
        path: '../../../tmp/malicious.txt',
        root: tempDir,
        content: 'bad content',
      })
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toContain('Access denied')
    })
  })

  describe('GET /api/fs/is-git-repo', () => {
    test('returns true for git repository', async () => {
      const repo = createTestGitRepo()

      try {
        const { get } = createTestApp()
        const res = await get(`/api/fs/is-git-repo?path=${repo.path}`)
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body.isGitRepo).toBe(true)
        expect(body.path).toBe(repo.path)
      } finally {
        repo.cleanup()
      }
    })

    test('returns false for non-git directory', async () => {
      const { get } = createTestApp()
      const res = await get(`/api/fs/is-git-repo?path=${tempDir}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.isGitRepo).toBe(false)
    })

    test('expands tilde path', async () => {
      const { get } = createTestApp()
      const res = await get('/api/fs/is-git-repo?path=~')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.path).toBe(homedir())
    })

    test('returns 400 when path is missing', async () => {
      const { get } = createTestApp()
      const res = await get('/api/fs/is-git-repo')
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('path parameter is required')
    })

    test('returns 404 for non-existent path', async () => {
      const { get } = createTestApp()
      const res = await get('/api/fs/is-git-repo?path=/nonexistent/path')
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toContain('does not exist')
    })

    test('returns 400 for file path', async () => {
      const filePath = join(tempDir, 'file.txt')
      writeFileSync(filePath, 'content')

      const { get } = createTestApp()
      const res = await get(`/api/fs/is-git-repo?path=${filePath}`)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('not a directory')
    })
  })
})
