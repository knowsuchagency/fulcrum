import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'
import { sendNotification, testNotificationChannel, type NotificationPayload } from './notification-service'
import { updateNotificationSettings, getNotificationSettings } from '../lib/settings'

// Mock the broadcast function since we don't want to actually send WebSocket messages in tests
mock.module('../websocket/terminal-ws', () => ({
  broadcast: () => {},
}))

describe('Notification Service', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
    // Ensure notifications are enabled by default
    updateNotificationSettings({ enabled: true })
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('sendNotification', () => {
    test('returns empty array when notifications are disabled', async () => {
      updateNotificationSettings({ enabled: false })

      const payload: NotificationPayload = {
        title: 'Test',
        message: 'Test message',
        type: 'task_status_change',
      }

      const results = await sendNotification(payload)
      expect(results).toEqual([])
    })

    test('sends notification when enabled', async () => {
      updateNotificationSettings({
        enabled: true,
        sound: { enabled: false },
        slack: { enabled: false, webhookUrl: '' },
        discord: { enabled: false, webhookUrl: '' },
        pushover: { enabled: false, appToken: '', userKey: '' },
      })

      const payload: NotificationPayload = {
        title: 'Test',
        message: 'Test message',
        type: 'task_status_change',
      }

      // With all channels disabled, only UI broadcast happens (no results)
      const results = await sendNotification(payload)
      expect(results).toEqual([])
    })

    test('includes sound in results when sound is enabled', async () => {
      updateNotificationSettings({
        enabled: true,
        sound: { enabled: true },
        slack: { enabled: false, webhookUrl: '' },
        discord: { enabled: false, webhookUrl: '' },
        pushover: { enabled: false, appToken: '', userKey: '' },
      })

      const payload: NotificationPayload = {
        title: 'Test',
        message: 'Test message',
        type: 'task_status_change',
      }

      const results = await sendNotification(payload)
      expect(results.some(r => r.channel === 'sound')).toBe(true)
    })

    test('handles different notification types', async () => {
      updateNotificationSettings({ enabled: true })

      const types: NotificationPayload['type'][] = [
        'task_status_change',
        'pr_merged',
        'plan_complete',
        'deployment_success',
        'deployment_failed',
      ]

      for (const type of types) {
        const payload: NotificationPayload = {
          title: `Test ${type}`,
          message: 'Test message',
          type,
        }

        // Should not throw
        await sendNotification(payload)
      }
    })

    test('includes optional fields in payload', async () => {
      updateNotificationSettings({ enabled: true })

      const payload: NotificationPayload = {
        title: 'Test',
        message: 'Test message',
        type: 'task_status_change',
        taskId: 'task-123',
        taskTitle: 'My Task',
        appId: 'app-456',
        appName: 'My App',
        url: 'https://example.com',
      }

      // Should not throw
      await sendNotification(payload)
    })
  })

  describe('testNotificationChannel', () => {
    describe('sound channel', () => {
      test('returns success for sound test', async () => {
        const result = await testNotificationChannel('sound')
        expect(result.channel).toBe('sound')
        expect(result.success).toBe(true)
      })
    })

    describe('slack channel', () => {
      test('returns error when webhook URL not configured', async () => {
        updateNotificationSettings({
          slack: { enabled: true, webhookUrl: '' },
        })

        const result = await testNotificationChannel('slack')
        expect(result.channel).toBe('slack')
        expect(result.success).toBe(false)
        expect(result.error).toContain('Webhook URL not configured')
      })

      test('sends request to webhook URL', async () => {
        // Create a mock fetch that captures the request
        let capturedRequest: { url: string; body: string } | null = null
        const originalFetch = global.fetch
        global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
          const urlStr = typeof url === 'string' ? url : url.toString()
          if (urlStr.includes('slack.com')) {
            capturedRequest = {
              url: urlStr,
              body: init?.body as string,
            }
            return new Response('ok', { status: 200 })
          }
          return originalFetch(url, init)
        }

        try {
          updateNotificationSettings({
            slack: { enabled: true, webhookUrl: 'https://hooks.slack.com/services/test' },
          })

          const result = await testNotificationChannel('slack')
          expect(result.channel).toBe('slack')
          expect(result.success).toBe(true)
          expect(capturedRequest).not.toBeNull()
          expect(capturedRequest!.url).toBe('https://hooks.slack.com/services/test')
        } finally {
          global.fetch = originalFetch
        }
      })
    })

    describe('discord channel', () => {
      test('returns error when webhook URL not configured', async () => {
        updateNotificationSettings({
          discord: { enabled: true, webhookUrl: '' },
        })

        const result = await testNotificationChannel('discord')
        expect(result.channel).toBe('discord')
        expect(result.success).toBe(false)
        expect(result.error).toContain('Webhook URL not configured')
      })

      test('sends request to webhook URL', async () => {
        let capturedRequest: { url: string; body: string } | null = null
        const originalFetch = global.fetch
        global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
          const urlStr = typeof url === 'string' ? url : url.toString()
          if (urlStr.includes('discord.com')) {
            capturedRequest = {
              url: urlStr,
              body: init?.body as string,
            }
            return new Response('', { status: 204 })
          }
          return originalFetch(url, init)
        }

        try {
          updateNotificationSettings({
            discord: { enabled: true, webhookUrl: 'https://discord.com/api/webhooks/test' },
          })

          const result = await testNotificationChannel('discord')
          expect(result.channel).toBe('discord')
          expect(result.success).toBe(true)
          expect(capturedRequest).not.toBeNull()
          expect(capturedRequest!.url).toBe('https://discord.com/api/webhooks/test')

          // Verify it sends an embed
          const body = JSON.parse(capturedRequest!.body)
          expect(body.embeds).toBeDefined()
          expect(body.embeds[0].title).toBe('Test Notification')
        } finally {
          global.fetch = originalFetch
        }
      })
    })

    describe('pushover channel', () => {
      test('returns error when app token not configured', async () => {
        updateNotificationSettings({
          pushover: { enabled: true, appToken: '', userKey: 'user123' },
        })

        const result = await testNotificationChannel('pushover')
        expect(result.channel).toBe('pushover')
        expect(result.success).toBe(false)
        expect(result.error).toContain('not configured')
      })

      test('returns error when user key not configured', async () => {
        updateNotificationSettings({
          pushover: { enabled: true, appToken: 'app123', userKey: '' },
        })

        const result = await testNotificationChannel('pushover')
        expect(result.channel).toBe('pushover')
        expect(result.success).toBe(false)
        expect(result.error).toContain('not configured')
      })

      test('sends request to Pushover API', async () => {
        let capturedRequest: { url: string; body: string } | null = null
        const originalFetch = global.fetch
        global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
          const urlStr = typeof url === 'string' ? url : url.toString()
          if (urlStr.includes('pushover.net')) {
            capturedRequest = {
              url: urlStr,
              body: init?.body as string,
            }
            return new Response('{"status":1}', { status: 200 })
          }
          return originalFetch(url, init)
        }

        try {
          updateNotificationSettings({
            pushover: { enabled: true, appToken: 'app-token', userKey: 'user-key' },
          })

          const result = await testNotificationChannel('pushover')
          expect(result.channel).toBe('pushover')
          expect(result.success).toBe(true)
          expect(capturedRequest).not.toBeNull()
          expect(capturedRequest!.url).toBe('https://api.pushover.net/1/messages.json')

          // Verify it sends correct payload
          const body = JSON.parse(capturedRequest!.body)
          expect(body.token).toBe('app-token')
          expect(body.user).toBe('user-key')
          expect(body.title).toBe('Test Notification')
        } finally {
          global.fetch = originalFetch
        }
      })
    })

    test('returns error for unknown channel', async () => {
      // @ts-expect-error - testing invalid channel
      const result = await testNotificationChannel('unknown')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unknown channel')
    })
  })
})
