import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestApp } from '../__tests__/fixtures/app'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'

describe('Health Routes', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('GET /health', () => {
    test('returns status ok', async () => {
      const { get } = createTestApp()
      const res = await get('/health')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.status).toBe('ok')
    })

    test('includes uptime', async () => {
      const { get } = createTestApp()
      const res = await get('/health')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(typeof body.uptime).toBe('number')
      expect(body.uptime).toBeGreaterThanOrEqual(0)
    })

    test('includes version when VIBORA_VERSION is set', async () => {
      process.env.VIBORA_VERSION = '1.2.3'

      try {
        const { get } = createTestApp()
        const res = await get('/health')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body.version).toBe('1.2.3')
      } finally {
        delete process.env.VIBORA_VERSION
      }
    })

    test('version is null when VIBORA_VERSION not set', async () => {
      delete process.env.VIBORA_VERSION

      const { get } = createTestApp()
      const res = await get('/health')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.version).toBe(null)
    })
  })
})
