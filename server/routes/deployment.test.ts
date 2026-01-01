import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { createTestApp } from '../__tests__/fixtures/app'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'

// Mock Docker checks
mock.module('../services/docker-compose', () => ({
  checkDockerInstalled: () => Promise.resolve(true),
  checkDockerRunning: () => Promise.resolve(true),
  getDockerVersion: () => Promise.resolve('24.0.7'),
}))

// Mock Traefik detection
mock.module('../services/traefik', () => ({
  detectTraefik: () =>
    Promise.resolve({
      type: 'vibora',
      containerName: 'traefik',
      configDir: '/etc/traefik/dynamic',
      network: 'traefik',
    }),
  checkConfigDirWritable: () => Promise.resolve(true),
}))

// Mock Traefik container management
mock.module('../services/traefik-docker', () => ({
  getTraefikContainerStatus: () => Promise.resolve('running'),
  startTraefikContainer: () => Promise.resolve({ success: true }),
  stopTraefikContainer: () => Promise.resolve({ success: true }),
  getTraefikLogs: () => Promise.resolve('Traefik started'),
  TRAEFIK_CONTAINER_NAME: 'traefik',
  TRAEFIK_NETWORK: 'traefik',
  TRAEFIK_DYNAMIC_DIR: '/etc/traefik/dynamic',
}))

describe('Deployment Routes', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('GET /api/deployment/prerequisites', () => {
    test('returns Docker and Traefik status', async () => {
      const { get } = createTestApp()
      const res = await get('/api/deployment/prerequisites')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.docker).toBeDefined()
      expect(body.docker.installed).toBe(true)
      expect(body.docker.running).toBe(true)
      expect(body.docker.version).toBe('24.0.7')

      expect(body.traefik).toBeDefined()
      expect(body.traefik.detected).toBe(true)
      expect(body.traefik.type).toBe('vibora')
      expect(body.traefik.containerName).toBe('traefik')
      expect(body.traefik.network).toBe('traefik')
      expect(body.traefik.configWritable).toBe(true)

      expect(body.settings).toBeDefined()
      expect(body.ready).toBe(true)
    })

    test('returns Cloudflare configured status', async () => {
      const { get } = createTestApp()
      const res = await get('/api/deployment/prerequisites')
      const body = await res.json()

      expect(body.settings.cloudflareConfigured).toBeDefined()
      // Initially should be false since no token is set
      expect(body.settings.cloudflareConfigured).toBe(false)
    })
  })

  describe('GET /api/deployment/settings', () => {
    test('returns settings with masked token when not configured', async () => {
      const { get } = createTestApp()
      const res = await get('/api/deployment/settings')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.cloudflareApiToken).toBeNull()
      expect(body.cloudflareConfigured).toBe(false)
    })

    test('returns masked token when configured', async () => {
      const { post, get } = createTestApp()

      // First set the token
      await post('/api/deployment/settings', {
        cloudflareApiToken: 'test-token-12345',
      })

      // Then get settings
      const res = await get('/api/deployment/settings')
      const body = await res.json()

      expect(res.status).toBe(200)
      // Token is masked with bullets matching its length
      expect(body.cloudflareApiToken).toBe('•'.repeat('test-token-12345'.length))
      expect(body.cloudflareConfigured).toBe(true)
    })
  })

  describe('POST /api/deployment/settings', () => {
    test('saves Cloudflare API token', async () => {
      const { post, get } = createTestApp()

      const res = await post('/api/deployment/settings', {
        cloudflareApiToken: 'new-test-token',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.settings.cloudflareConfigured).toBe(true)

      // Verify it persisted
      const getRes = await get('/api/deployment/settings')
      const getBody = await getRes.json()
      expect(getBody.cloudflareConfigured).toBe(true)
    })

    test('clears token when null is passed', async () => {
      const { post, get } = createTestApp()

      // First set a token
      await post('/api/deployment/settings', {
        cloudflareApiToken: 'to-be-cleared',
      })

      // Then clear it
      const res = await post('/api/deployment/settings', {
        cloudflareApiToken: null,
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.settings.cloudflareConfigured).toBe(false)

      // Verify it's cleared
      const getRes = await get('/api/deployment/settings')
      const getBody = await getRes.json()
      expect(getBody.cloudflareConfigured).toBe(false)
    })
  })

  describe('POST /api/deployment/traefik/start', () => {
    test('starts Traefik container', async () => {
      const { post } = createTestApp()
      const res = await post('/api/deployment/traefik/start')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.containerName).toBe('traefik')
      expect(body.network).toBe('traefik')
    })
  })

  describe('POST /api/deployment/traefik/stop', () => {
    test('stops Traefik container', async () => {
      const { post } = createTestApp()
      const res = await post('/api/deployment/traefik/stop')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
    })
  })

  describe('GET /api/deployment/traefik/logs', () => {
    test('returns Traefik logs', async () => {
      const { get } = createTestApp()
      const res = await get('/api/deployment/traefik/logs')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.logs).toBeDefined()
    })

    test('accepts tail parameter', async () => {
      const { get } = createTestApp()
      const res = await get('/api/deployment/traefik/logs?tail=50')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.logs).toBeDefined()
    })
  })

  describe('Legacy Caddy endpoints', () => {
    test('POST /api/deployment/caddy/start returns 410 Gone', async () => {
      const { post } = createTestApp()
      const res = await post('/api/deployment/caddy/start')
      const body = await res.json()

      expect(res.status).toBe(410)
      expect(body.code).toBe('DEPRECATED')
      expect(body.error).toContain('Caddy is no longer used')
    })

    test('POST /api/deployment/caddy/stop returns 410 Gone', async () => {
      const { post } = createTestApp()
      const res = await post('/api/deployment/caddy/stop')
      const body = await res.json()

      expect(res.status).toBe(410)
      expect(body.code).toBe('DEPRECATED')
    })
  })
})
