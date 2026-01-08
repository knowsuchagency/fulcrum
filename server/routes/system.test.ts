import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestApp } from '../__tests__/fixtures/app'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'

describe('System Routes', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('GET /api/system/dependencies', () => {
    test('returns dependency status object', async () => {
      const { get } = createTestApp()
      const res = await get('/api/system/dependencies')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toHaveProperty('claudeCode')
      expect(body).toHaveProperty('openCode')
      expect(body).toHaveProperty('dtach')
    })

    test('claudeCode has installed property', async () => {
      const { get } = createTestApp()
      const res = await get('/api/system/dependencies')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(typeof body.claudeCode.installed).toBe('boolean')
    })

    test('dtach has installed property', async () => {
      const { get } = createTestApp()
      const res = await get('/api/system/dependencies')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(typeof body.dtach.installed).toBe('boolean')
    })

    test('openCode has installed property', async () => {
      const { get } = createTestApp()
      const res = await get('/api/system/dependencies')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(typeof body.openCode.installed).toBe('boolean')
    })

    test('respects VIBORA_CLAUDE_INSTALLED env var', async () => {
      process.env.VIBORA_CLAUDE_INSTALLED = '1'
      delete process.env.VIBORA_CLAUDE_MISSING

      try {
        const { get } = createTestApp()
        const res = await get('/api/system/dependencies')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body.claudeCode.installed).toBe(true)
      } finally {
        delete process.env.VIBORA_CLAUDE_INSTALLED
      }
    })

    test('respects VIBORA_CLAUDE_MISSING env var', async () => {
      process.env.VIBORA_CLAUDE_MISSING = '1'
      delete process.env.VIBORA_CLAUDE_INSTALLED

      try {
        const { get } = createTestApp()
        const res = await get('/api/system/dependencies')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body.claudeCode.installed).toBe(false)
      } finally {
        delete process.env.VIBORA_CLAUDE_MISSING
      }
    })

    test('includes path when dependency is installed', async () => {
      const { get } = createTestApp()
      const res = await get('/api/system/dependencies')
      const body = await res.json()

      expect(res.status).toBe(200)
      // dtach should be installed in test environment
      if (body.dtach.installed) {
        expect(body.dtach.path).toBeDefined()
        expect(typeof body.dtach.path).toBe('string')
      }
    })
  })
})
