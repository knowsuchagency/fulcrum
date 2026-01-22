import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestApp } from '../__tests__/fixtures/app'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'

describe('Version Routes', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('GET /api/version/check', () => {
    test('returns version info structure', async () => {
      process.env.FULCRUM_VERSION = '1.0.0'

      try {
        const { get } = createTestApp()
        const res = await get('/api/version/check')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body).toHaveProperty('currentVersion')
        expect(body).toHaveProperty('latestVersion')
        expect(body).toHaveProperty('updateAvailable')
        expect(body).toHaveProperty('updateCommand')
        expect(body).toHaveProperty('releaseUrl')
        expect(body.currentVersion).toBe('1.0.0')
        expect(body.updateCommand).toBe('fulcrum update')
      } finally {
        delete process.env.FULCRUM_VERSION
      }
    })

    test('returns null currentVersion when FULCRUM_VERSION not set', async () => {
      delete process.env.FULCRUM_VERSION

      const { get } = createTestApp()
      const res = await get('/api/version/check')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.currentVersion).toBe(null)
    })

    test('updateAvailable is boolean', async () => {
      process.env.FULCRUM_VERSION = '1.0.0'

      try {
        const { get } = createTestApp()
        const res = await get('/api/version/check')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(typeof body.updateAvailable).toBe('boolean')
      } finally {
        delete process.env.FULCRUM_VERSION
      }
    })

    test('releaseUrl points to GitHub', async () => {
      const { get } = createTestApp()
      const res = await get('/api/version/check')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.releaseUrl).toContain('github.com')
      expect(body.releaseUrl).toContain('releases')
    })
  })

  describe('POST /api/version/update', () => {
    test('returns 400 when already on latest version', async () => {
      // Set a very high version so we're "already on latest"
      process.env.FULCRUM_VERSION = '999.999.999'

      try {
        const { post } = createTestApp()
        const res = await post('/api/version/update')
        const body = await res.json()

        // Should either be 400 (already on latest) or 503 (can't fetch)
        expect([400, 503]).toContain(res.status)
        expect(body.success).toBe(false)
      } finally {
        delete process.env.FULCRUM_VERSION
      }
    })
  })
})
