import { describe, test, expect } from 'bun:test'
import { FNOX_CONFIG_MAP, FNOX_SECRET_MAP, isSecretPath } from './fnox'
import { VALID_SETTING_PATHS } from './types'

describe('fnox', () => {
  describe('FNOX_CONFIG_MAP', () => {
    test('all mapped settings paths are valid setting paths, notification paths, zai paths, or internal', () => {
      // Paths outside of VALID_SETTING_PATHS that are managed in their own config sections
      const extraPaths = new Set([
        'notifications.enabled',
        'notifications.toast.enabled',
        'notifications.desktop.enabled',
        'notifications.sound.enabled',
        'notifications.sound.customSoundFile',
        'notifications.slack.enabled',
        'notifications.slack.webhookUrl',
        'notifications.slack.useMessagingChannel',
        'notifications.discord.enabled',
        'notifications.discord.webhookUrl',
        'notifications.discord.useMessagingChannel',
        'notifications.pushover.enabled',
        'notifications.pushover.appToken',
        'notifications.pushover.userKey',
        'notifications.whatsapp.enabled',
        'notifications.telegram.enabled',
        'notifications.gmail.enabled',
        'notifications.gmail.googleAccountId',
        'notifications._updatedAt',
        'zai.enabled',
        'zai.apiKey',
        'zai.haikuModel',
        'zai.sonnetModel',
        'zai.opusModel',
        '_schemaVersion',
      ])

      for (const settingsPath of Object.keys(FNOX_CONFIG_MAP)) {
        const isValid = VALID_SETTING_PATHS.has(settingsPath) || extraPaths.has(settingsPath)
        if (!isValid) throw new Error(`Unexpected settings path: ${settingsPath}`)
        expect(isValid).toBe(true)
      }
    })

    test('all fnox keys use FULCRUM_ prefix', () => {
      for (const entry of Object.values(FNOX_CONFIG_MAP)) {
        expect(entry.fnoxKey.startsWith('FULCRUM_')).toBe(true)
      }
    })

    test('all fnox keys are unique', () => {
      const keys = Object.values(FNOX_CONFIG_MAP).map(e => e.fnoxKey)
      const uniqueKeys = new Set(keys)
      expect(keys.length).toBe(uniqueKeys.size)
    })

    test('covers all VALID_SETTING_PATHS', () => {
      for (const path of VALID_SETTING_PATHS) {
        expect(FNOX_CONFIG_MAP[path]).toBeDefined()
      }
    })

    test('has entries for all setting types', () => {
      const types = new Set(Object.values(FNOX_CONFIG_MAP).map(e => e.type))
      expect(types.has('string')).toBe(true)
      expect(types.has('number')).toBe(true)
      expect(types.has('boolean')).toBe(true)
    })

    test('has entries for both providers', () => {
      const providers = new Set(Object.values(FNOX_CONFIG_MAP).map(e => e.provider))
      expect(providers.has('plain')).toBe(true)
      expect(providers.has('age')).toBe(true)
    })

    test('maps known integration secrets', () => {
      expect(FNOX_CONFIG_MAP['integrations.githubPat'].fnoxKey).toBe('FULCRUM_GITHUB_PAT')
      expect(FNOX_CONFIG_MAP['integrations.githubPat'].provider).toBe('age')
      expect(FNOX_CONFIG_MAP['integrations.cloudflareApiToken'].fnoxKey).toBe('FULCRUM_CLOUDFLARE_API_TOKEN')
      expect(FNOX_CONFIG_MAP['integrations.googleClientId'].fnoxKey).toBe('FULCRUM_GOOGLE_CLIENT_ID')
      expect(FNOX_CONFIG_MAP['integrations.googleClientSecret'].fnoxKey).toBe('FULCRUM_GOOGLE_CLIENT_SECRET')
    })

    test('maps known channel secrets', () => {
      expect(FNOX_CONFIG_MAP['channels.slack.botToken'].fnoxKey).toBe('FULCRUM_SLACK_BOT_TOKEN')
      expect(FNOX_CONFIG_MAP['channels.slack.botToken'].provider).toBe('age')
      expect(FNOX_CONFIG_MAP['channels.slack.appToken'].fnoxKey).toBe('FULCRUM_SLACK_APP_TOKEN')
      expect(FNOX_CONFIG_MAP['channels.discord.botToken'].fnoxKey).toBe('FULCRUM_DISCORD_BOT_TOKEN')
      expect(FNOX_CONFIG_MAP['channels.telegram.botToken'].fnoxKey).toBe('FULCRUM_TELEGRAM_BOT_TOKEN')
      expect(FNOX_CONFIG_MAP['channels.email.imap.password'].fnoxKey).toBe('FULCRUM_EMAIL_IMAP_PASSWORD')
    })

    test('maps known notification secrets', () => {
      expect(FNOX_CONFIG_MAP['notifications.pushover.appToken'].fnoxKey).toBe('FULCRUM_PUSHOVER_APP_TOKEN')
      expect(FNOX_CONFIG_MAP['notifications.pushover.appToken'].provider).toBe('age')
      expect(FNOX_CONFIG_MAP['notifications.pushover.userKey'].fnoxKey).toBe('FULCRUM_PUSHOVER_USER_KEY')
      expect(FNOX_CONFIG_MAP['notifications.slack.webhookUrl'].fnoxKey).toBe('FULCRUM_SLACK_WEBHOOK_URL')
      expect(FNOX_CONFIG_MAP['notifications.discord.webhookUrl'].fnoxKey).toBe('FULCRUM_DISCORD_WEBHOOK_URL')
    })

    test('maps z.ai secret', () => {
      expect(FNOX_CONFIG_MAP['zai.apiKey'].fnoxKey).toBe('FULCRUM_ZAI_API_KEY')
      expect(FNOX_CONFIG_MAP['zai.apiKey'].provider).toBe('age')
    })

    test('maps plain config values', () => {
      expect(FNOX_CONFIG_MAP['server.port'].provider).toBe('plain')
      expect(FNOX_CONFIG_MAP['server.port'].type).toBe('number')
      expect(FNOX_CONFIG_MAP['editor.app'].provider).toBe('plain')
      expect(FNOX_CONFIG_MAP['editor.app'].type).toBe('string')
      expect(FNOX_CONFIG_MAP['agent.autoScrollToBottom'].provider).toBe('plain')
      expect(FNOX_CONFIG_MAP['agent.autoScrollToBottom'].type).toBe('boolean')
    })
  })

  describe('FNOX_SECRET_MAP (backward compat)', () => {
    test('contains only age-encrypted entries', () => {
      for (const [fnoxKey, settingsPath] of Object.entries(FNOX_SECRET_MAP)) {
        expect(FNOX_CONFIG_MAP[settingsPath].provider).toBe('age')
        expect(FNOX_CONFIG_MAP[settingsPath].fnoxKey).toBe(fnoxKey)
      }
    })

    test('has expected number of secret mappings (15)', () => {
      expect(Object.keys(FNOX_SECRET_MAP).length).toBe(15)
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
      const { isFnoxAvailable } = await import('./fnox')
      expect(isFnoxAvailable()).toBe(false)
    })

    test('getFnoxSecret returns null when cache is empty', async () => {
      const { getFnoxSecret } = await import('./fnox')
      expect(getFnoxSecret('integrations.githubPat')).toBeNull()
    })

    test('getFnoxValue returns null when cache is empty', async () => {
      const { getFnoxValue } = await import('./fnox')
      expect(getFnoxValue('server.port')).toBeNull()
    })

    test('setFnoxValue/getFnoxValue roundtrip works in test mode (cache only)', async () => {
      const { setFnoxValue, getFnoxValue, clearFnoxCache } = await import('./fnox')
      clearFnoxCache()
      setFnoxValue('server.port', 9999)
      expect(getFnoxValue('server.port')).toBe(9999)
      clearFnoxCache()
      expect(getFnoxValue('server.port')).toBeNull()
    })
  })
})
