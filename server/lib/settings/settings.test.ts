import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('Settings', () => {
  describe('schema version sync', () => {
    test('CURRENT_SCHEMA_VERSION matches package.json major version', async () => {
      const { CURRENT_SCHEMA_VERSION } = await import('./')
      const packageJson = await import('../../../package.json')
      const majorVersion = parseInt(packageJson.version.split('.')[0], 10)

      expect(CURRENT_SCHEMA_VERSION).toBe(majorVersion)
    })
  })

  let tempDir: string
  let originalEnv: Record<string, string | undefined>

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'fulcrum-settings-test-'))

    // Save original env values
    originalEnv = {
      FULCRUM_DIR: process.env.FULCRUM_DIR,
      PORT: process.env.PORT,
      FULCRUM_GIT_REPOS_DIR: process.env.FULCRUM_GIT_REPOS_DIR,
      GITHUB_PAT: process.env.GITHUB_PAT,
    }

    // Set test environment
    process.env.FULCRUM_DIR = tempDir
    delete process.env.PORT
    delete process.env.FULCRUM_GIT_REPOS_DIR
    delete process.env.GITHUB_PAT

    // Clear fnox cache between tests to prevent pollution
    const { clearFnoxCache } = await import('./')
    clearFnoxCache()
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

  describe('getFulcrumDir', () => {
    test('uses FULCRUM_DIR env var when set', async () => {
      // Dynamic import to pick up new env var
      const { getFulcrumDir } = await import('./')
      expect(getFulcrumDir()).toBe(tempDir)
    })

    test('expands tilde in FULCRUM_DIR', async () => {
      const home = process.env.HOME || ''
      process.env.FULCRUM_DIR = '~/test-fulcrum'

      // Re-import to get fresh module
      const settingsModule = await import('./')
      const result = settingsModule.getFulcrumDir()

      expect(result).toBe(join(home, 'test-fulcrum'))
    })
  })

  describe('getSettings', () => {
    test('returns defaults when no config exists', async () => {
      const { getSettings } = await import('./')
      const settings = getSettings()

      expect(settings.server.port).toBe(7777)
      expect(settings.paths.defaultGitReposDir).toBe(process.env.HOME)
      expect(settings.integrations.githubPat).toBeNull()
    })

    test('reads settings from fnox cache', async () => {
      const { updateSettingByPath, getSettings, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()

      updateSettingByPath('server.port', 8888)
      updateSettingByPath('paths.defaultGitReposDir', '/custom/path')

      const settings = getSettings()
      expect(settings.server.port).toBe(8888)
      expect(settings.paths.defaultGitReposDir).toBe('/custom/path')
    })

    test('environment variables override fnox values', async () => {
      const { updateSettingByPath, getSettings, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()

      updateSettingByPath('server.port', 8888)
      updateSettingByPath('integrations.githubPat', 'fnox-key')

      process.env.PORT = '9999'
      process.env.GITHUB_PAT = 'env-key'

      const settings = getSettings()
      expect(settings.server.port).toBe(9999)
      expect(settings.integrations.githubPat).toBe('env-key')
    })

    test('ignores invalid PORT env var', async () => {
      process.env.PORT = 'not-a-number'

      const { getSettings } = await import('./')
      const settings = getSettings()

      expect(settings.server.port).toBe(7777) // Default
    })
  })

  describe('updateSettingByPath', () => {
    test('updates setting and reads back via getSettings', async () => {
      const { updateSettingByPath, getSettings, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()
      updateSettingByPath('server.port', 9000)

      const settings = getSettings()
      expect(settings.server.port).toBe(9000)
    })

    test('updates nested settings', async () => {
      const { updateSettingByPath, getSettings, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()

      updateSettingByPath('integrations.githubPat', 'new-key')
      const settings = getSettings()
      expect(settings.integrations.githubPat).toBe('new-key')
    })

    test('throws error for unknown setting path', async () => {
      const { updateSettingByPath, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()
      expect(() => updateSettingByPath('unknown.path', 'value')).toThrow('Unknown setting path: unknown.path')
    })

    test('clears value when set to null', async () => {
      const { updateSettingByPath, getSettings, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()

      updateSettingByPath('integrations.githubPat', 'some-key')
      expect(getSettings().integrations.githubPat).toBe('some-key')

      updateSettingByPath('integrations.githubPat', null)
      expect(getSettings().integrations.githubPat).toBeNull()
    })
  })

  describe('resetSettings', () => {
    test('resets to defaults', async () => {
      const { updateSettingByPath, resetSettings, getSettings, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()

      updateSettingByPath('server.port', 9999)
      updateSettingByPath('integrations.githubPat', 'custom-key')

      resetSettings()

      const settings = getSettings()
      expect(settings.server.port).toBe(7777)
      expect(settings.integrations.githubPat).toBeNull()
    })
  })

  describe('notification settings', () => {
    test('returns defaults when not configured', async () => {
      const { getNotificationSettings, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()
      const settings = getNotificationSettings()

      // New defaults: notifications and sound enabled by default
      expect(settings.enabled).toBe(true)
      expect(settings.sound.enabled).toBe(true)
      expect(settings.slack.enabled).toBe(false)
      expect(settings.discord.enabled).toBe(false)
      expect(settings.pushover.enabled).toBe(false)
    })

    test('reads notification settings from fnox cache', async () => {
      const { setFnoxValue, getNotificationSettings, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()

      setFnoxValue('notifications.enabled', true)
      setFnoxValue('notifications.sound.enabled', true)
      setFnoxValue('notifications.sound.customSoundFile', '/path/to/sound.wav')
      setFnoxValue('notifications.slack.enabled', true)
      setFnoxValue('notifications.slack.webhookUrl', 'https://hooks.slack.com/test')

      const settings = getNotificationSettings()
      expect(settings.enabled).toBe(true)
      expect(settings.sound.enabled).toBe(true)
      expect(settings.sound.customSoundFile).toBe('/path/to/sound.wav')
      expect(settings.slack.enabled).toBe(true)
      expect(settings.slack.webhookUrl).toBe('https://hooks.slack.com/test')
    })

    test('updates notification settings', async () => {
      const { updateNotificationSettings, getNotificationSettings, ensureFulcrumDir } =
        await import('./')
      ensureFulcrumDir()

      const result = await updateNotificationSettings({
        enabled: false,
        sound: { enabled: false },
      })

      // Should return the updated settings, not a conflict
      expect('conflict' in result).toBe(false)
      const settings = getNotificationSettings()
      expect(settings.enabled).toBe(false)
      expect(settings.sound.enabled).toBe(false)
    })

    test('includes _updatedAt timestamp in notification settings', async () => {
      const { getNotificationSettings, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()

      const settings = getNotificationSettings()
      expect(settings._updatedAt).toBeDefined()
      expect(typeof settings._updatedAt).toBe('number')
    })

    test('updates _updatedAt timestamp on each update', async () => {
      const { updateNotificationSettings, getNotificationSettings, ensureFulcrumDir } =
        await import('./')
      ensureFulcrumDir()

      const before = getNotificationSettings()
      const originalTimestamp = before._updatedAt

      // Small delay to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10))

      await updateNotificationSettings({ enabled: true })
      const after = getNotificationSettings()

      expect(after._updatedAt).toBeDefined()
      expect(after._updatedAt).toBeGreaterThan(originalTimestamp!)
    })

    test('rejects stale update when client timestamp does not match', async () => {
      const { updateNotificationSettings, getNotificationSettings, ensureFulcrumDir } =
        await import('./')
      ensureFulcrumDir()

      // Get current settings and timestamp
      const current = getNotificationSettings()
      const currentTimestamp = current._updatedAt

      // Small delay to ensure timestamp changes (millisecond precision)
      await new Promise((resolve) => setTimeout(resolve, 5))

      // Simulate another client updating the settings
      await updateNotificationSettings({ enabled: true })
      const afterOtherUpdate = getNotificationSettings()

      // Now try to update with the stale timestamp (should conflict)
      const result = await updateNotificationSettings(
        { enabled: false },
        currentTimestamp // This is now stale
      )

      // Should return conflict
      expect('conflict' in result && result.conflict).toBe(true)
      if ('conflict' in result) {
        expect(result.current._updatedAt).toBe(afterOtherUpdate._updatedAt)
      }

      // Settings should not have changed
      const settings = getNotificationSettings()
      expect(settings.enabled).toBe(true) // Still what the "other client" set
    })

    test('accepts update when client timestamp matches', async () => {
      const { updateNotificationSettings, getNotificationSettings, ensureFulcrumDir } =
        await import('./')
      ensureFulcrumDir()

      // Get current timestamp
      const current = getNotificationSettings()
      const currentTimestamp = current._updatedAt

      // Update with matching timestamp (should succeed)
      const result = await updateNotificationSettings({ enabled: false }, currentTimestamp)

      // Should not be a conflict
      expect('conflict' in result).toBe(false)

      const settings = getNotificationSettings()
      expect(settings.enabled).toBe(false)
    })

    test('allows update without client timestamp (backward compatibility)', async () => {
      const { updateNotificationSettings, getNotificationSettings, ensureFulcrumDir } =
        await import('./')
      ensureFulcrumDir()

      // Update without passing a timestamp
      const result = await updateNotificationSettings({ enabled: false })

      // Should succeed (no conflict checking when no client timestamp)
      expect('conflict' in result).toBe(false)

      const settings = getNotificationSettings()
      expect(settings.enabled).toBe(false)
    })
  })

  describe('z.ai settings', () => {
    test('returns defaults when not configured', async () => {
      const { getZAiSettings, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()
      const settings = getZAiSettings()

      expect(settings.enabled).toBe(false)
      expect(settings.apiKey).toBeNull()
      expect(settings.haikuModel).toBe('glm-4.5-air')
      expect(settings.sonnetModel).toBe('glm-4.7')
      expect(settings.opusModel).toBe('glm-4.7')
    })

    test('reads z.ai settings from fnox cache', async () => {
      const { setFnoxValue, getZAiSettings, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()

      setFnoxValue('zai.enabled', true)
      setFnoxValue('zai.apiKey', 'test-zai-key')
      setFnoxValue('zai.haikuModel', 'custom-haiku')

      const settings = getZAiSettings()
      expect(settings.enabled).toBe(true)
      expect(settings.apiKey).toBe('test-zai-key')
      expect(settings.haikuModel).toBe('custom-haiku')
      expect(settings.sonnetModel).toBe('glm-4.7') // Default
    })

    test('updates z.ai settings', async () => {
      const { updateZAiSettings, getZAiSettings, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()

      updateZAiSettings({
        enabled: true,
        apiKey: 'new-key',
      })

      const settings = getZAiSettings()
      expect(settings.enabled).toBe(true)
      expect(settings.apiKey).toBe('new-key')
    })
  })

  describe('ensureLatestSettings', () => {
    test('does not crash when called in test mode', async () => {
      const { ensureLatestSettings, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()

      // Should not throw — in test mode, fnox CLI is not available,
      // so migration and schema version set are skipped
      expect(() => ensureLatestSettings()).not.toThrow()
    })
  })

  describe('agent settings', () => {
    test('returns default agent as claude when not configured', async () => {
      const { getSettings, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()
      const settings = getSettings()

      expect(settings.agent.defaultAgent).toBe('claude')
    })

    test('reads agent.defaultAgent from cache', async () => {
      const { updateSettingByPath, getSettings, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()

      updateSettingByPath('agent.defaultAgent', 'opencode')
      const settings = getSettings()
      expect(settings.agent.defaultAgent).toBe('opencode')
    })

    test('updates agent.defaultAgent via updateSettingByPath', async () => {
      const { updateSettingByPath, getSettings, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()

      updateSettingByPath('agent.defaultAgent', 'opencode')
      const settings = getSettings()
      expect(settings.agent.defaultAgent).toBe('opencode')
    })
  })

  describe('task settings', () => {
    test('returns default task settings when not configured', async () => {
      const { getSettings, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()
      const settings = getSettings()

      expect(settings.tasks.defaultTaskType).toBe('worktree')
      expect(settings.tasks.startWorktreeTasksImmediately).toBe(true)
    })

    test('reads task settings from cache', async () => {
      const { updateSettingByPath, getSettings, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()

      updateSettingByPath('tasks.defaultTaskType', 'manual')
      updateSettingByPath('tasks.startWorktreeTasksImmediately', false)

      const settings = getSettings()
      expect(settings.tasks.defaultTaskType).toBe('manual')
      expect(settings.tasks.startWorktreeTasksImmediately).toBe(false)
    })

    test('updates task settings via updateSettingByPath', async () => {
      const { updateSettingByPath, getSettings, ensureFulcrumDir } = await import('./')
      ensureFulcrumDir()

      updateSettingByPath('tasks.defaultTaskType', 'manual')
      let settings = getSettings()
      expect(settings.tasks.defaultTaskType).toBe('manual')

      updateSettingByPath('tasks.startWorktreeTasksImmediately', false)
      settings = getSettings()
      expect(settings.tasks.startWorktreeTasksImmediately).toBe(false)
    })
  })

  describe('getSettings() completeness', () => {
    // Recursively collect all leaf paths from an object
    function collectPaths(obj: Record<string, unknown>, prefix = ''): string[] {
      const paths: string[] = []
      for (const [key, value] of Object.entries(obj)) {
        if (key === '_schemaVersion') continue
        const path = prefix ? `${prefix}.${key}` : key
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          paths.push(...collectPaths(value as Record<string, unknown>, path))
        } else {
          paths.push(path)
        }
      }
      return paths
    }

    test('returns every field from DEFAULT_SETTINGS (no dropped fields in manual construction)', async () => {
      const { getSettings, DEFAULT_SETTINGS } = await import('./')
      const settings = getSettings()

      const defaultPaths = collectPaths(DEFAULT_SETTINGS as unknown as Record<string, unknown>)
      const settingsPaths = collectPaths(settings as unknown as Record<string, unknown>)

      const missing = defaultPaths.filter((p) => !settingsPaths.includes(p))

      if (missing.length > 0) {
        throw new Error(
          `getSettings() is missing fields that exist in DEFAULT_SETTINGS:\n` +
            missing.map((p) => `  - ${p}`).join('\n') +
            `\n\nAdd them to the settings object in getSettings() (server/lib/settings/core.ts).`
        )
      }
    })

    test('write-then-read roundtrip preserves value for all VALID_SETTING_PATHS', async () => {
      const { updateSettingByPath, getSettings, ensureFulcrumDir } = await import('./')

      ensureFulcrumDir()

      // Pick a few representative paths from different sections to test the roundtrip
      const testPaths: Record<string, unknown> = {
        'assistant.observerModel': 'sonnet',
        'assistant.observerProvider': 'claude',
        'assistant.observerOpencodeModel': 'test-model',
        'agent.claudeCodePath': '/test/path',
        'assistant.model': 'opus',
        'assistant.provider': 'opencode',
        'agent.defaultAgent': 'opencode',
        'appearance.timezone': 'UTC',
      }

      for (const [path, value] of Object.entries(testPaths)) {
        updateSettingByPath(path, value)
        const settings = getSettings()
        const parts = path.split('.')
        let current: unknown = settings
        for (const part of parts) {
          current = (current as Record<string, unknown>)[part]
        }
        if (current !== value) {
          throw new Error(
            `Roundtrip failed for ${path}: wrote ${JSON.stringify(value)}, read ${JSON.stringify(current)}`
          )
        }
      }
    })
  })

  describe('helper functions', () => {
    test('getNestedValue retrieves nested values', async () => {
      const { getNestedValue } = await import('./')

      const obj = {
        server: { port: 8080 },
        deep: { nested: { value: 'test' } },
      }

      expect(getNestedValue(obj, 'server.port')).toBe(8080)
      expect(getNestedValue(obj, 'deep.nested.value')).toBe('test')
      expect(getNestedValue(obj, 'nonexistent.path')).toBeUndefined()
    })

    test('setNestedValue sets nested values', async () => {
      const { setNestedValue } = await import('./')

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
