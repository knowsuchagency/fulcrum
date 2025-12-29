import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('Settings', () => {
  let tempDir: string
  let originalEnv: Record<string, string | undefined>

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vibora-settings-test-'))

    // Save original env values
    originalEnv = {
      VIBORA_DIR: process.env.VIBORA_DIR,
      PORT: process.env.PORT,
      VIBORA_GIT_REPOS_DIR: process.env.VIBORA_GIT_REPOS_DIR,
      LINEAR_API_KEY: process.env.LINEAR_API_KEY,
      GITHUB_PAT: process.env.GITHUB_PAT,
    }

    // Set test environment
    process.env.VIBORA_DIR = tempDir
    delete process.env.PORT
    delete process.env.VIBORA_GIT_REPOS_DIR
    delete process.env.LINEAR_API_KEY
    delete process.env.GITHUB_PAT
  })

  afterEach(() => {
    // Restore original env values
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }

    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('getViboraDir', () => {
    test('uses VIBORA_DIR env var when set', async () => {
      // Dynamic import to pick up new env var
      const { getViboraDir } = await import('./settings')
      expect(getViboraDir()).toBe(tempDir)
    })

    test('expands tilde in VIBORA_DIR', async () => {
      const home = process.env.HOME || ''
      process.env.VIBORA_DIR = '~/test-vibora'

      // Re-import to get fresh module
      const settingsModule = await import('./settings')
      const result = settingsModule.getViboraDir()

      expect(result).toBe(join(home, 'test-vibora'))
    })
  })

  describe('getSettings', () => {
    test('returns defaults when no settings file exists', async () => {
      const { getSettings } = await import('./settings')
      const settings = getSettings()

      expect(settings.server.port).toBe(7777)
      expect(settings.paths.defaultGitReposDir).toBe(process.env.HOME)
      expect(settings.integrations.linearApiKey).toBeNull()
      expect(settings.integrations.githubPat).toBeNull()
    })

    test('reads settings from file', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          _schemaVersion: 2,
          server: { port: 8888 },
          paths: { defaultGitReposDir: '/custom/path' },
          integrations: { linearApiKey: 'test-linear-key' },
        })
      )

      const { getSettings } = await import('./settings')
      const settings = getSettings()

      expect(settings.server.port).toBe(8888)
      expect(settings.paths.defaultGitReposDir).toBe('/custom/path')
      expect(settings.integrations.linearApiKey).toBe('test-linear-key')
    })

    test('environment variables override file settings', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          _schemaVersion: 2,
          server: { port: 8888 },
          integrations: { linearApiKey: 'file-key' },
        })
      )

      process.env.PORT = '9999'
      process.env.LINEAR_API_KEY = 'env-key'

      const { getSettings } = await import('./settings')
      const settings = getSettings()

      expect(settings.server.port).toBe(9999)
      expect(settings.integrations.linearApiKey).toBe('env-key')
    })

    test('ignores invalid PORT env var', async () => {
      process.env.PORT = 'not-a-number'

      const { getSettings } = await import('./settings')
      const settings = getSettings()

      expect(settings.server.port).toBe(7777) // Default
    })
  })

  describe('migration', () => {
    test('migrates flat settings to nested structure', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          port: 8888,
          defaultGitReposDir: '/migrated/path',
          linearApiKey: 'migrated-key',
        })
      )

      const { getSettings } = await import('./settings')
      const settings = getSettings()

      // Settings should be migrated
      expect(settings.server.port).toBe(8888)
      expect(settings.paths.defaultGitReposDir).toBe('/migrated/path')
      expect(settings.integrations.linearApiKey).toBe('migrated-key')

      // File should be updated with nested structure
      const migrated = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      expect(migrated._schemaVersion).toBe(4) // Current schema version
      expect(migrated.server?.port).toBe(8888)
      expect(migrated.paths?.defaultGitReposDir).toBe('/migrated/path')
      expect(migrated.integrations?.linearApiKey).toBe('migrated-key')

      // Old flat keys should be removed
      expect(migrated.port).toBeUndefined()
      expect(migrated.defaultGitReposDir).toBeUndefined()
      expect(migrated.linearApiKey).toBeUndefined()
    })

    test('does not migrate old default port (3333)', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          port: 3333, // Old default
        })
      )

      const { getSettings } = await import('./settings')
      const settings = getSettings()

      // Should get new default, not old default
      expect(settings.server.port).toBe(7777)
    })

    test('skips migration if already at current schema version', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      const originalContent = {
        _schemaVersion: 4, // Current schema version
        server: { port: 8888 },
      }
      writeFileSync(settingsPath, JSON.stringify(originalContent))

      const { getSettings } = await import('./settings')
      getSettings()

      // File should be unchanged (no unnecessary writes)
      const content = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      expect(content).toEqual(originalContent)
    })
  })

  describe('updateSettingByPath', () => {
    test('creates settings file if it does not exist', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      expect(existsSync(settingsPath)).toBe(false)

      const { updateSettingByPath, getSettings, ensureViboraDir } = await import('./settings')
      ensureViboraDir()
      updateSettingByPath('server.port', 9000)

      expect(existsSync(settingsPath)).toBe(true)
      const settings = getSettings()
      expect(settings.server.port).toBe(9000)
    })

    test('updates nested setting and persists', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          _schemaVersion: 2,
          server: { port: 7777 },
        })
      )

      const { updateSettingByPath, getSettings } = await import('./settings')
      updateSettingByPath('server.port', 8080)

      const settings = getSettings()
      expect(settings.server.port).toBe(8080)

      // Verify persistence
      const file = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      expect(file.server.port).toBe(8080)
    })

    test('creates nested structure for deep paths', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(settingsPath, JSON.stringify({}))

      const { updateSettingByPath } = await import('./settings')
      updateSettingByPath('integrations.linearApiKey', 'new-key')

      const file = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      expect(file.integrations.linearApiKey).toBe('new-key')
    })
  })

  describe('resetSettings', () => {
    test('resets to defaults', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          _schemaVersion: 2,
          server: { port: 9999 },
          integrations: { linearApiKey: 'custom-key' },
        })
      )

      const { resetSettings, getSettings, ensureViboraDir } = await import('./settings')
      ensureViboraDir()
      resetSettings()

      const settings = getSettings()
      expect(settings.server.port).toBe(7777)
      expect(settings.integrations.linearApiKey).toBeNull()
    })
  })

  describe('notification settings', () => {
    test('returns defaults when not configured', async () => {
      const { getNotificationSettings, ensureViboraDir } = await import('./settings')
      ensureViboraDir()
      const settings = getNotificationSettings()

      // New defaults: notifications and sound enabled by default
      expect(settings.enabled).toBe(true)
      expect(settings.sound.enabled).toBe(true)
      expect(settings.slack.enabled).toBe(false)
      expect(settings.discord.enabled).toBe(false)
      expect(settings.pushover.enabled).toBe(false)
    })

    test('reads notification settings from file', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          notifications: {
            enabled: true,
            sound: { enabled: true, customSoundFile: '/path/to/sound.wav' },
            slack: { enabled: true, webhookUrl: 'https://hooks.slack.com/test' },
          },
        })
      )

      const { getNotificationSettings } = await import('./settings')
      const settings = getNotificationSettings()

      expect(settings.enabled).toBe(true)
      expect(settings.sound.enabled).toBe(true)
      expect(settings.sound.customSoundFile).toBe('/path/to/sound.wav')
      expect(settings.slack.enabled).toBe(true)
      expect(settings.slack.webhookUrl).toBe('https://hooks.slack.com/test')
    })

    test('updates notification settings', async () => {
      const { updateNotificationSettings, getNotificationSettings, ensureViboraDir } =
        await import('./settings')
      ensureViboraDir()

      updateNotificationSettings({
        enabled: false,
        sound: { enabled: false },
      })

      const settings = getNotificationSettings()
      expect(settings.enabled).toBe(false)
      expect(settings.sound.enabled).toBe(false)
    })
  })

  describe('z.ai settings', () => {
    test('returns defaults when not configured', async () => {
      const { getZAiSettings, ensureViboraDir } = await import('./settings')
      ensureViboraDir()
      const settings = getZAiSettings()

      expect(settings.enabled).toBe(false)
      expect(settings.apiKey).toBeNull()
      expect(settings.haikuModel).toBe('glm-4.5-air')
      expect(settings.sonnetModel).toBe('glm-4.7')
      expect(settings.opusModel).toBe('glm-4.7')
    })

    test('reads z.ai settings from file', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          zai: {
            enabled: true,
            apiKey: 'test-zai-key',
            haikuModel: 'custom-haiku',
          },
        })
      )

      const { getZAiSettings } = await import('./settings')
      const settings = getZAiSettings()

      expect(settings.enabled).toBe(true)
      expect(settings.apiKey).toBe('test-zai-key')
      expect(settings.haikuModel).toBe('custom-haiku')
      expect(settings.sonnetModel).toBe('glm-4.7') // Default
    })

    test('updates z.ai settings', async () => {
      const { updateZAiSettings, getZAiSettings, ensureViboraDir } = await import('./settings')
      ensureViboraDir()

      updateZAiSettings({
        enabled: true,
        apiKey: 'new-key',
      })

      const settings = getZAiSettings()
      expect(settings.enabled).toBe(true)
      expect(settings.apiKey).toBe('new-key')
    })
  })

  describe('helper functions', () => {
    test('getNestedValue retrieves nested values', async () => {
      const { getNestedValue } = await import('./settings')

      const obj = {
        server: { port: 8080 },
        deep: { nested: { value: 'test' } },
      }

      expect(getNestedValue(obj, 'server.port')).toBe(8080)
      expect(getNestedValue(obj, 'deep.nested.value')).toBe('test')
      expect(getNestedValue(obj, 'nonexistent.path')).toBeUndefined()
    })

    test('setNestedValue sets nested values', async () => {
      const { setNestedValue } = await import('./settings')

      const obj: Record<string, unknown> = {}
      setNestedValue(obj, 'server.port', 9000)
      setNestedValue(obj, 'deep.nested.value', 'test')

      expect(obj).toEqual({
        server: { port: 9000 },
        deep: { nested: { value: 'test' } },
      })
    })
  })
})
