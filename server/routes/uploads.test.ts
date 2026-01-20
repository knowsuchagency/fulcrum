import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestApp } from '../__tests__/fixtures/app'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getFulcrumDir } from '../lib/settings'

describe('Uploads Routes', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('POST /api/uploads', () => {
    test('uploads image file', async () => {
      // Create a minimal PNG
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

      const formData = new FormData()
      formData.append('file', new Blob([pngBuffer], { type: 'image/png' }), 'test.png')

      const { request } = createTestApp()
      const res = await request('/api/uploads', {
        method: 'POST',
        body: formData,
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.path).toBeDefined()
      expect(body.path).toContain('clipboard-')
      expect(body.path).toEndWith('.png')

      // Verify file was created
      expect(existsSync(body.path)).toBe(true)
    })

    test('returns 400 when no file provided', async () => {
      const { request } = createTestApp()
      const res = await request('/api/uploads', {
        method: 'POST',
        body: new FormData(),
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('No file provided')
    })

    test('returns 400 for non-image file', async () => {
      const formData = new FormData()
      formData.append('file', new Blob(['test text'], { type: 'text/plain' }), 'test.txt')

      const { request } = createTestApp()
      const res = await request('/api/uploads', {
        method: 'POST',
        body: formData,
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('must be an image')
    })

    test('uploads JPEG file', async () => {
      // Minimal JPEG (just headers, not a valid image but enough to test upload)
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
        0x00, 0x01, 0x00, 0x00, 0xff, 0xd9
      ])

      const formData = new FormData()
      formData.append('file', new Blob([jpegBuffer], { type: 'image/jpeg' }), 'test.jpg')

      const { request } = createTestApp()
      const res = await request('/api/uploads', {
        method: 'POST',
        body: formData,
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.path).toEndWith('.jpg')
    })

    test('creates uploads directory if it does not exist', async () => {
      const uploadsDir = join(getFulcrumDir(), 'uploads')
      expect(existsSync(uploadsDir)).toBe(false) // Should not exist yet

      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xde, 0xff, 0xd9
      ])

      const formData = new FormData()
      formData.append('file', new Blob([pngBuffer], { type: 'image/png' }), 'test.png')

      const { request } = createTestApp()
      await request('/api/uploads', {
        method: 'POST',
        body: formData,
      })

      expect(existsSync(uploadsDir)).toBe(true)
    })
  })

  describe('GET /api/uploads/:filename', () => {
    test('serves uploaded image', async () => {
      // Create an upload manually
      const uploadsDir = join(getFulcrumDir(), 'uploads')
      mkdirSync(uploadsDir, { recursive: true })

      const filename = 'clipboard-2025-01-01-120000.png'
      const filePath = join(uploadsDir, filename)
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xde, 0xff, 0xd9
      ])
      writeFileSync(filePath, pngBuffer)

      const { get } = createTestApp()
      const res = await get(`/api/uploads/${filename}`)

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('image/png')
    })

    test('returns 404 for non-existent file', async () => {
      const { get } = createTestApp()
      const res = await get('/api/uploads/clipboard-2025-01-01-120000.png')

      expect(res.status).toBe(404)
    })

    test('returns 404 for invalid filename format', async () => {
      const { get } = createTestApp()

      // Try to access a file with an invalid name pattern
      const res = await get('/api/uploads/malicious.png')
      expect(res.status).toBe(404)

      const res2 = await get('/api/uploads/../../../etc/passwd')
      expect(res2.status).toBe(404)

      const res3 = await get('/api/uploads/some-random-file.png')
      expect(res3.status).toBe(404)
    })
  })

  describe('POST /api/uploads/sound', () => {
    test('uploads audio file', async () => {
      // Minimal MP3 header
      const mp3Buffer = Buffer.from([
        0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
      ])

      const formData = new FormData()
      formData.append('file', new Blob([mp3Buffer], { type: 'audio/mpeg' }), 'test.mp3')

      const { request } = createTestApp()
      const res = await request('/api/uploads/sound', {
        method: 'POST',
        body: formData,
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.path).toBeDefined()
      expect(body.path).toContain('notification-sound')
      expect(body.filename).toBe('notification-sound.mp3')

      // Verify file was created
      expect(existsSync(body.path)).toBe(true)
    })

    test('returns 400 when no file provided', async () => {
      const { request } = createTestApp()
      const res = await request('/api/uploads/sound', {
        method: 'POST',
        body: new FormData(),
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('No file provided')
    })

    test('returns 400 for non-audio file', async () => {
      const formData = new FormData()
      formData.append('file', new Blob(['test'], { type: 'text/plain' }), 'test.txt')

      const { request } = createTestApp()
      const res = await request('/api/uploads/sound', {
        method: 'POST',
        body: formData,
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('must be an audio file')
    })

    test('uploads WAV file', async () => {
      // Minimal WAV header
      const wavBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x24, 0x00, 0x00, 0x00, // Size
        0x57, 0x41, 0x56, 0x45, // WAVE
        0x66, 0x6d, 0x74, 0x20, // fmt
        0x10, 0x00, 0x00, 0x00, // Subchunk1Size
        0x01, 0x00, 0x01, 0x00, // AudioFormat, NumChannels
        0x44, 0xac, 0x00, 0x00, // SampleRate
        0x88, 0x58, 0x01, 0x00, // ByteRate
        0x02, 0x00, 0x10, 0x00, // BlockAlign, BitsPerSample
        0x64, 0x61, 0x74, 0x61, // data
        0x00, 0x00, 0x00, 0x00  // Subchunk2Size
      ])

      const formData = new FormData()
      formData.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'test.wav')

      const { request } = createTestApp()
      const res = await request('/api/uploads/sound', {
        method: 'POST',
        body: formData,
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.filename).toBe('notification-sound.wav')
    })
  })

  describe('GET /api/uploads/sound', () => {
    test('serves custom sound file', async () => {
      // First upload a sound
      const mp3Buffer = Buffer.from([
        0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00
      ])

      const formData = new FormData()
      formData.append('file', new Blob([mp3Buffer], { type: 'audio/mpeg' }), 'test.mp3')

      const { request, get } = createTestApp()
      await request('/api/uploads/sound', {
        method: 'POST',
        body: formData,
      })

      // Now try to get it
      const res = await get('/api/uploads/sound')

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('audio/mpeg')
    })

    test('returns 404 when no custom sound exists', async () => {
      const { get } = createTestApp()
      const res = await get('/api/uploads/sound')

      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/uploads/sound', () => {
    test('deletes custom sound file', async () => {
      // First upload a sound
      const mp3Buffer = Buffer.from([
        0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00
      ])

      const formData = new FormData()
      formData.append('file', new Blob([mp3Buffer], { type: 'audio/mpeg' }), 'test.mp3')

      const { request } = createTestApp()
      const uploadRes = await request('/api/uploads/sound', {
        method: 'POST',
        body: formData,
      })
      const uploadBody = await uploadRes.json()
      expect(existsSync(uploadBody.path)).toBe(true)

      // Delete it
      const res = await request('/api/uploads/sound', {
        method: 'DELETE',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(existsSync(uploadBody.path)).toBe(false)
    })

    test('succeeds even when no custom sound exists', async () => {
      const { request } = createTestApp()
      const res = await request('/api/uploads/sound', {
        method: 'DELETE',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
    })
  })
})
