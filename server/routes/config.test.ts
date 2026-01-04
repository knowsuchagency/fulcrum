// IMPORTANT: Mock MUST be called BEFORE any imports that use the settings module
// This prevents tests from modifying real user files (~/.claude/settings.json, ~/.claude.json)
import { mock } from 'bun:test'

mock.module('../lib/settings', () => {
  const actual = require('../lib/settings')
  return {
    ...actual,
    // Mock functions that write to ~/.claude/* files (outside VIBORA_DIR)
    // These must NEVER modify real user files during tests
    getClaudeSettings: () => ({}),
    updateClaudeSettings: mock(() => {}),
    getClaudeConfig: () => ({}),
    updateClaudeConfig: mock(() => {}),
    syncClaudeCodeTheme: mock(() => {}),
  }
})

// Now import test utilities and test framework
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestApp } from '../__tests__/fixtures/app'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'

describe('Config Routes', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('GET /api/config', () => {
    test('returns all config values', async () => {
      const { get } = createTestApp()
      const res = await get('/api/config')
      const body = await res.json()

      expect(res.status).toBe(200)
      // Keys are literal dot-notation strings, not nested paths
      expect(body['server.port']).toBeDefined()
      expect(body['paths.defaultGitReposDir']).toBeDefined()
      expect(body['editor.app']).toBeDefined()
    })
  })

  describe('GET /api/config/:key', () => {
    test('returns value for valid key', async () => {
      const { get } = createTestApp()
      const res = await get('/api/config/server.port')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.key).toBe('server.port')
      expect(typeof body.value).toBe('number')
    })

    test('returns worktree_base_path (special read-only key)', async () => {
      const { get } = createTestApp()
      const res = await get('/api/config/worktree_base_path')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.key).toBe('worktree_base_path')
      expect(typeof body.value).toBe('string')
      expect(body.isDefault).toBe(true)
    })

    test('returns home_dir (special read-only key)', async () => {
      const { get } = createTestApp()
      const res = await get('/api/config/home_dir')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.key).toBe('home_dir')
      expect(typeof body.value).toBe('string')
      expect(body.isDefault).toBe(true)
    })

    test('returns 404 for unknown key', async () => {
      const { get } = createTestApp()
      const res = await get('/api/config/unknown_key')
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toContain('Unknown config key')
    })

    test('supports legacy key mapping', async () => {
      const { get } = createTestApp()
      const res = await get('/api/config/port') // Legacy key for server.port
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.key).toBe('port')
      expect(typeof body.value).toBe('number')
    })

    test('returns isDefault flag', async () => {
      const { get } = createTestApp()
      const res = await get('/api/config/server.port')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(typeof body.isDefault).toBe('boolean')
    })
  })

  describe('PUT /api/config/:key', () => {
    test('updates port value', async () => {
      const { put, get } = createTestApp()
      const res = await put('/api/config/server.port', { value: 8888 })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.value).toBe(8888)

      // Verify the value persisted
      const checkRes = await get('/api/config/server.port')
      const checkBody = await checkRes.json()
      expect(checkBody.value).toBe(8888)
    })

    test('validates port range', async () => {
      const { put } = createTestApp()

      // Port too low
      const res1 = await put('/api/config/server.port', { value: 0 })
      expect(res1.status).toBe(400)

      // Port too high
      const res2 = await put('/api/config/server.port', { value: 70000 })
      expect(res2.status).toBe(400)
    })

    test('validates editor app value', async () => {
      const { put } = createTestApp()

      // Valid editor
      const res1 = await put('/api/config/editor.app', { value: 'vscode' })
      expect(res1.status).toBe(200)

      // Invalid editor
      const res2 = await put('/api/config/editor.app', { value: 'invalid_editor' })
      expect(res2.status).toBe(400)
      const body2 = await res2.json()
      expect(body2.error).toContain('must be one of')
    })

    test('validates language value', async () => {
      const { put } = createTestApp()

      // Valid language
      const res1 = await put('/api/config/appearance.language', { value: 'en' })
      expect(res1.status).toBe(200)

      const res2 = await put('/api/config/appearance.language', { value: 'zh' })
      expect(res2.status).toBe(200)

      // Invalid language
      const res3 = await put('/api/config/appearance.language', { value: 'invalid' })
      expect(res3.status).toBe(400)
    })

    test('validates theme value', async () => {
      const { put } = createTestApp()

      // Valid themes
      const res1 = await put('/api/config/appearance.theme', { value: 'light' })
      expect(res1.status).toBe(200)

      const res2 = await put('/api/config/appearance.theme', { value: 'dark' })
      expect(res2.status).toBe(200)

      const res3 = await put('/api/config/appearance.theme', { value: 'system' })
      expect(res3.status).toBe(200)

      // Invalid theme
      const res4 = await put('/api/config/appearance.theme', { value: 'invalid' })
      expect(res4.status).toBe(400)
    })

    test('converts empty string to null for nullable fields', async () => {
      const { put, get } = createTestApp()
      const res = await put('/api/config/integrations.linearApiKey', { value: '' })

      expect(res.status).toBe(200)

      const checkRes = await get('/api/config/integrations.linearApiKey')
      const checkBody = await checkRes.json()
      expect(checkBody.value).toBe(null)
    })

    test('returns 400 for unknown key', async () => {
      const { put } = createTestApp()
      const res = await put('/api/config/unknown_key', { value: 'test' })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('Unknown')
    })

    test('validates default agent', async () => {
      const { put } = createTestApp()

      // Valid agents
      const res1 = await put('/api/config/agent.defaultAgent', { value: 'claude' })
      expect(res1.status).toBe(200)

      const res2 = await put('/api/config/agent.defaultAgent', { value: 'opencode' })
      expect(res2.status).toBe(200)

      // Invalid agent
      const res3 = await put('/api/config/agent.defaultAgent', { value: 'invalid' })
      expect(res3.status).toBe(400)
    })
  })

  describe('DELETE /api/config/:key', () => {
    test('resets key to default value', async () => {
      const { put, request, get } = createTestApp()

      // Set a non-default value
      await put('/api/config/server.port', { value: 9999 })

      // Reset it
      const res = await request('/api/config/server.port', { method: 'DELETE' })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.isDefault).toBe(true)

      // Verify it's back to default (7777)
      const checkRes = await get('/api/config/server.port')
      const checkBody = await checkRes.json()
      expect(checkBody.value).toBe(7777)
    })

    test('returns 400 for unknown key', async () => {
      const { request } = createTestApp()
      const res = await request('/api/config/unknown_key', { method: 'DELETE' })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('Unknown config key')
    })
  })

  describe('GET /api/config/notifications', () => {
    test('returns notification settings', async () => {
      const { get } = createTestApp()
      const res = await get('/api/config/notifications')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toHaveProperty('enabled')
      expect(body).toHaveProperty('toast')
      expect(body).toHaveProperty('desktop')
      expect(body).toHaveProperty('sound')
      expect(body).toHaveProperty('slack')
      expect(body).toHaveProperty('discord')
      expect(body).toHaveProperty('pushover')
    })
  })

  describe('PUT /api/config/notifications', () => {
    test('updates notification settings', async () => {
      const { put, get } = createTestApp()
      const res = await put('/api/config/notifications', {
        enabled: false,
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.enabled).toBe(false)

      // Verify persistence
      const checkRes = await get('/api/config/notifications')
      const checkBody = await checkRes.json()
      expect(checkBody.enabled).toBe(false)
    })

    test('updates nested notification channel settings', async () => {
      const { put } = createTestApp()
      const res = await put('/api/config/notifications', {
        slack: {
          enabled: true,
          webhookUrl: 'https://hooks.slack.com/services/test',
        },
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.slack.enabled).toBe(true)
      expect(body.slack.webhookUrl).toBe('https://hooks.slack.com/services/test')
    })
  })

  describe('POST /api/config/notifications/test/:channel', () => {
    test('returns 400 for invalid channel', async () => {
      const { post } = createTestApp()
      const res = await post('/api/config/notifications/test/invalid')
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('Invalid channel')
    })

    test('accepts valid channel names', async () => {
      const { post } = createTestApp()

      // Sound channel (doesn't need external config)
      const res = await post('/api/config/notifications/test/sound')
      // Should succeed or fail based on audio availability, not return 400
      expect(res.status).not.toBe(400)
    })
  })

  describe('POST /api/config/notifications/send', () => {
    test('returns 400 when title is missing', async () => {
      const { post } = createTestApp()
      const res = await post('/api/config/notifications/send', {
        message: 'Test message',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('title and message are required')
    })

    test('returns 400 when message is missing', async () => {
      const { post } = createTestApp()
      const res = await post('/api/config/notifications/send', {
        title: 'Test title',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('title and message are required')
    })

    test('sends notification with valid payload', async () => {
      const { post } = createTestApp()
      const res = await post('/api/config/notifications/send', {
        title: 'Test',
        message: 'Test message',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.results).toBeDefined()
    })
  })

  describe('GET /api/config/z-ai', () => {
    test('returns z.ai settings', async () => {
      const { get } = createTestApp()
      const res = await get('/api/config/z-ai')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toHaveProperty('enabled')
      expect(body).toHaveProperty('apiKey')
    })
  })

  describe('PUT /api/config/z-ai', () => {
    test('updates z.ai settings', async () => {
      const { put } = createTestApp()
      const res = await put('/api/config/z-ai', {
        enabled: true,
        apiKey: 'test-api-key',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.enabled).toBe(true)
      expect(body.apiKey).toBe('test-api-key')
    })
  })

  describe('GET /api/config/developer-mode', () => {
    test('returns developer mode status', async () => {
      const { get } = createTestApp()
      const res = await get('/api/config/developer-mode')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(typeof body.enabled).toBe('boolean')
      expect(typeof body.startedAt).toBe('number')
    })
  })

  describe('POST /api/config/restart', () => {
    test('returns 403 when not in developer mode', async () => {
      // Ensure not in developer mode (isDeveloperMode checks VIBORA_DEVELOPER)
      const originalDev = process.env.VIBORA_DEVELOPER
      delete process.env.VIBORA_DEVELOPER

      try {
        const { post } = createTestApp()
        const res = await post('/api/config/restart')
        const body = await res.json()

        expect(res.status).toBe(403)
        expect(body.error).toContain('developer mode')
      } finally {
        // Restore original value
        if (originalDev !== undefined) {
          process.env.VIBORA_DEVELOPER = originalDev
        }
      }
    })
  })

  describe('POST /api/config/sync-claude-theme', () => {
    test('syncs light theme', async () => {
      const { post } = createTestApp()
      const res = await post('/api/config/sync-claude-theme', {
        resolvedTheme: 'light',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.resolvedTheme).toBe('light')
    })

    test('syncs dark theme', async () => {
      const { post } = createTestApp()
      const res = await post('/api/config/sync-claude-theme', {
        resolvedTheme: 'dark',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.resolvedTheme).toBe('dark')
    })

    test('returns 400 for invalid theme', async () => {
      const { post } = createTestApp()
      const res = await post('/api/config/sync-claude-theme', {
        resolvedTheme: 'invalid',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('must be "light" or "dark"')
    })

    test('debounces rapid requests', async () => {
      const { post } = createTestApp()

      // First request should succeed
      const res1 = await post('/api/config/sync-claude-theme', {
        resolvedTheme: 'light',
      })
      const body1 = await res1.json()
      expect(body1.success).toBe(true)
      expect(body1.skipped).toBeUndefined()

      // Immediate second request with same theme should be skipped
      const res2 = await post('/api/config/sync-claude-theme', {
        resolvedTheme: 'light',
      })
      const body2 = await res2.json()
      expect(body2.success).toBe(true)
      expect(body2.skipped).toBe(true)
    })
  })
})
