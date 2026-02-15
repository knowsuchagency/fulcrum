import { describe, test, expect } from 'bun:test'
import { FNOX_SECRET_MAP, isSecretPath } from './fnox'
import { VALID_SETTING_PATHS } from './types'

describe('fnox', () => {
  describe('FNOX_SECRET_MAP', () => {
    test('all mapped paths are valid setting paths or notification/zai paths', () => {
      // Settings paths that are valid but managed outside VALID_SETTING_PATHS
      // (notification and zai secrets are in their own config sections)
      const notificationPaths = new Set([
        'notifications.pushover.appToken',
        'notifications.pushover.userKey',
        'notifications.slack.webhookUrl',
        'notifications.discord.webhookUrl',
        'zai.apiKey',
      ])

      for (const [, settingsPath] of Object.entries(FNOX_SECRET_MAP)) {
        const isValid = VALID_SETTING_PATHS.has(settingsPath) || notificationPaths.has(settingsPath)
        expect(isValid).toBe(true)
      }
    })

    test('all fnox keys use FULCRUM_ prefix', () => {
      for (const fnoxKey of Object.keys(FNOX_SECRET_MAP)) {
        expect(fnoxKey.startsWith('FULCRUM_')).toBe(true)
      }
    })

    test('has expected number of secret mappings', () => {
      expect(Object.keys(FNOX_SECRET_MAP).length).toBe(15)
    })

    test('maps known integration secrets', () => {
      expect(FNOX_SECRET_MAP.FULCRUM_GITHUB_PAT).toBe('integrations.githubPat')
      expect(FNOX_SECRET_MAP.FULCRUM_CLOUDFLARE_API_TOKEN).toBe('integrations.cloudflareApiToken')
      expect(FNOX_SECRET_MAP.FULCRUM_GOOGLE_CLIENT_ID).toBe('integrations.googleClientId')
      expect(FNOX_SECRET_MAP.FULCRUM_GOOGLE_CLIENT_SECRET).toBe('integrations.googleClientSecret')
    })

    test('maps known channel secrets', () => {
      expect(FNOX_SECRET_MAP.FULCRUM_SLACK_BOT_TOKEN).toBe('channels.slack.botToken')
      expect(FNOX_SECRET_MAP.FULCRUM_SLACK_APP_TOKEN).toBe('channels.slack.appToken')
      expect(FNOX_SECRET_MAP.FULCRUM_DISCORD_BOT_TOKEN).toBe('channels.discord.botToken')
      expect(FNOX_SECRET_MAP.FULCRUM_TELEGRAM_BOT_TOKEN).toBe('channels.telegram.botToken')
      expect(FNOX_SECRET_MAP.FULCRUM_EMAIL_IMAP_PASSWORD).toBe('channels.email.imap.password')
    })

    test('maps known notification secrets', () => {
      expect(FNOX_SECRET_MAP.FULCRUM_PUSHOVER_APP_TOKEN).toBe('notifications.pushover.appToken')
      expect(FNOX_SECRET_MAP.FULCRUM_PUSHOVER_USER_KEY).toBe('notifications.pushover.userKey')
      expect(FNOX_SECRET_MAP.FULCRUM_SLACK_WEBHOOK_URL).toBe('notifications.slack.webhookUrl')
      expect(FNOX_SECRET_MAP.FULCRUM_DISCORD_WEBHOOK_URL).toBe('notifications.discord.webhookUrl')
    })

    test('maps z.ai secret', () => {
      expect(FNOX_SECRET_MAP.FULCRUM_ZAI_API_KEY).toBe('zai.apiKey')
    })
  })

  describe('isSecretPath', () => {
    test('returns true for known secret paths', () => {
      expect(isSecretPath('integrations.githubPat')).toBe(true)
      expect(isSecretPath('integrations.cloudflareApiToken')).toBe(true)
      expect(isSecretPath('channels.slack.botToken')).toBe(true)
      expect(isSecretPath('notifications.pushover.appToken')).toBe(true)
      expect(isSecretPath('zai.apiKey')).toBe(true)
    })

    test('returns false for non-secret paths', () => {
      expect(isSecretPath('server.port')).toBe(false)
      expect(isSecretPath('editor.app')).toBe(false)
      expect(isSecretPath('appearance.theme')).toBe(false)
      expect(isSecretPath('channels.slack.enabled')).toBe(false)
      expect(isSecretPath('notifications.enabled')).toBe(false)
    })

    test('returns false for unknown paths', () => {
      expect(isSecretPath('foo.bar')).toBe(false)
      expect(isSecretPath('')).toBe(false)
    })
  })

  describe('test mode behavior', () => {
    test('isFnoxAvailable returns false in test mode', async () => {
      // Tests run with test isolation, so isFnoxAvailable should return false
      const { isFnoxAvailable } = await import('./fnox')
      // In test environment, FULCRUM_FNOX_INSTALLED is not set and
      // fnox.toml/age.txt don't exist in the test FULCRUM_DIR
      expect(isFnoxAvailable()).toBe(false)
    })

    test('getFnoxSecret returns null when unavailable', async () => {
      const { getFnoxSecret } = await import('./fnox')
      expect(getFnoxSecret('integrations.githubPat')).toBeNull()
    })
  })
})
