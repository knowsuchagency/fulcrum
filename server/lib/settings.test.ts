import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('Settings', () => {
  describe('schema version sync', () => {
    test('CURRENT_SCHEMA_VERSION matches package.json major version', async () => {
      const { CURRENT_SCHEMA_VERSION } = await import('./settings')
      const packageJson = await import('../../package.json')
      const majorVersion = parseInt(packageJson.version.split('.')[0], 10)

      expect(CURRENT_SCHEMA_VERSION).toBe(majorVersion)
    })
  })

  let tempDir: string
  let originalEnv: Record<string, string | undefined>

  beforeEach(() => {
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
      const { getFulcrumDir } = await import('./settings')
      expect(getFulcrumDir()).toBe(tempDir)
    })

    test('expands tilde in FULCRUM_DIR', async () => {
      const home = process.env.HOME || ''
      process.env.FULCRUM_DIR = '~/test-fulcrum'

      // Re-import to get fresh module
      const settingsModule = await import('./settings')
      const result = settingsModule.getFulcrumDir()

      expect(result).toBe(join(home, 'test-fulcrum'))
    })
  })

  describe('getSettings', () => {
    test('returns defaults when no settings file exists', async () => {
      const { getSettings } = await import('./settings')
      const settings = getSettings()

      expect(settings.server.port).toBe(7777)
      expect(settings.paths.defaultGitReposDir).toBe(process.env.HOME)
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
          integrations: { githubPat: 'test-github-pat' },
        })
      )

      const { getSettings } = await import('./settings')
      const settings = getSettings()

      expect(settings.server.port).toBe(8888)
      expect(settings.paths.defaultGitReposDir).toBe('/custom/path')
      expect(settings.integrations.githubPat).toBe('test-github-pat')
    })

    test('environment variables override file settings', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          _schemaVersion: 2,
          server: { port: 8888 },
          integrations: { githubPat: 'file-key' },
        })
      )

      process.env.PORT = '9999'
      process.env.GITHUB_PAT = 'env-key'

      const { getSettings } = await import('./settings')
      const settings = getSettings()

      expect(settings.server.port).toBe(9999)
      expect(settings.integrations.githubPat).toBe('env-key')
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
          githubPat: 'migrated-key',
        })
      )

      const { getSettings } = await import('./settings')
      const settings = getSettings()

      // Settings should be migrated
      expect(settings.server.port).toBe(8888)
      expect(settings.paths.defaultGitReposDir).toBe('/migrated/path')
      expect(settings.integrations.githubPat).toBe('migrated-key')

      // File should be updated with nested structure
      const migrated = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      expect(migrated._schemaVersion).toBe(1) // Current schema version
      expect(migrated.server?.port).toBe(8888)
      expect(migrated.paths?.defaultGitReposDir).toBe('/migrated/path')
      expect(migrated.integrations?.githubPat).toBe('migrated-key')

      // Old flat keys should be removed
      expect(migrated.port).toBeUndefined()
      expect(migrated.defaultGitReposDir).toBeUndefined()
      expect(migrated.githubPat).toBeUndefined()
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
        _schemaVersion: 1, // Current schema version
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

      const { updateSettingByPath, getSettings, ensureFulcrumDir } = await import('./settings')
      ensureFulcrumDir()
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
      updateSettingByPath('integrations.githubPat', 'new-key')

      const file = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      expect(file.integrations.githubPat).toBe('new-key')
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
          integrations: { githubPat: 'custom-key' },
        })
      )

      const { resetSettings, getSettings, ensureFulcrumDir } = await import('./settings')
      ensureFulcrumDir()
      resetSettings()

      const settings = getSettings()
      expect(settings.server.port).toBe(7777)
      expect(settings.integrations.githubPat).toBeNull()
    })
  })

  describe('notification settings', () => {
    test('returns defaults when not configured', async () => {
      const { getNotificationSettings, ensureFulcrumDir } = await import('./settings')
      ensureFulcrumDir()
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
      const { updateNotificationSettings, getNotificationSettings, ensureFulcrumDir } =
        await import('./settings')
      ensureFulcrumDir()

      const result = updateNotificationSettings({
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
      const { getNotificationSettings, ensureFulcrumDir } = await import('./settings')
      ensureFulcrumDir()

      const settings = getNotificationSettings()
      expect(settings._updatedAt).toBeDefined()
      expect(typeof settings._updatedAt).toBe('number')
    })

    test('updates _updatedAt timestamp on each update', async () => {
      const { updateNotificationSettings, getNotificationSettings, ensureFulcrumDir } =
        await import('./settings')
      ensureFulcrumDir()

      const before = getNotificationSettings()
      const originalTimestamp = before._updatedAt

      // Small delay to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10))

      updateNotificationSettings({ enabled: true })
      const after = getNotificationSettings()

      expect(after._updatedAt).toBeDefined()
      expect(after._updatedAt).toBeGreaterThan(originalTimestamp!)
    })

    test('rejects stale update when client timestamp does not match', async () => {
      const { updateNotificationSettings, getNotificationSettings, ensureFulcrumDir } =
        await import('./settings')
      ensureFulcrumDir()

      // Get current settings and timestamp
      const current = getNotificationSettings()
      const currentTimestamp = current._updatedAt

      // Small delay to ensure timestamp changes (millisecond precision)
      await new Promise((resolve) => setTimeout(resolve, 5))

      // Simulate another client updating the settings
      updateNotificationSettings({ enabled: true })
      const afterOtherUpdate = getNotificationSettings()

      // Now try to update with the stale timestamp (should conflict)
      const result = updateNotificationSettings(
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
        await import('./settings')
      ensureFulcrumDir()

      // Get current timestamp
      const current = getNotificationSettings()
      const currentTimestamp = current._updatedAt

      // Update with matching timestamp (should succeed)
      const result = updateNotificationSettings({ enabled: false }, currentTimestamp)

      // Should not be a conflict
      expect('conflict' in result).toBe(false)

      const settings = getNotificationSettings()
      expect(settings.enabled).toBe(false)
    })

    test('allows update without client timestamp (backward compatibility)', async () => {
      const { updateNotificationSettings, getNotificationSettings, ensureFulcrumDir } =
        await import('./settings')
      ensureFulcrumDir()

      // Update without passing a timestamp
      const result = updateNotificationSettings({ enabled: false })

      // Should succeed (no conflict checking when no client timestamp)
      expect('conflict' in result).toBe(false)

      const settings = getNotificationSettings()
      expect(settings.enabled).toBe(false)
    })
  })

  describe('z.ai settings', () => {
    test('returns defaults when not configured', async () => {
      const { getZAiSettings, ensureFulcrumDir } = await import('./settings')
      ensureFulcrumDir()
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
      const { updateZAiSettings, getZAiSettings, ensureFulcrumDir } = await import('./settings')
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
    test('adds missing keys with defaults', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          _schemaVersion: 7,
          server: { port: 8888 },
          // Missing: paths, editor, integrations, appearance, notifications, zai
        })
      )

      const { ensureLatestSettings, ensureFulcrumDir } = await import('./settings')
      ensureFulcrumDir()
      ensureLatestSettings()

      const file = JSON.parse(readFileSync(settingsPath, 'utf-8'))

      // User value preserved
      expect(file.server.port).toBe(8888)

      // All sections should exist with defaults
      expect(file.paths).toBeDefined()
      expect(file.paths.defaultGitReposDir).toBeDefined()
      expect(file.editor).toBeDefined()
      expect(file.editor.app).toBe('vscode')
      expect(file.integrations).toBeDefined()
      expect(file.appearance).toBeDefined()
      expect(file.notifications).toBeDefined()
      expect(file.notifications.enabled).toBe(true)
      expect(file.zai).toBeDefined()
      expect(file.zai.enabled).toBe(false)
    })

    test('preserves user values while adding missing keys', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          _schemaVersion: 7,
          server: { port: 9999 },
          appearance: { theme: 'dark' }, // User set theme but missing other appearance keys
        })
      )

      const { ensureLatestSettings, ensureFulcrumDir } = await import('./settings')
      ensureFulcrumDir()
      ensureLatestSettings()

      const file = JSON.parse(readFileSync(settingsPath, 'utf-8'))

      // User values preserved
      expect(file.server.port).toBe(9999)
      expect(file.appearance.theme).toBe('dark')

      // Missing appearance keys added with defaults
      expect(file.appearance.syncClaudeCodeTheme).toBe(false)
      expect(file.appearance.claudeCodeLightTheme).toBe('light-ansi')
      expect(file.appearance.claudeCodeDarkTheme).toBe('dark-ansi')
    })

    test('preserves extra keys not in schema', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          _schemaVersion: 7,
          server: { port: 7777 },
          desktop: { zoomLevel: 1.5 }, // Extra key not in main schema
          lastUpdateCheck: 1234567890, // Another extra key
        })
      )

      const { ensureLatestSettings, ensureFulcrumDir } = await import('./settings')
      ensureFulcrumDir()
      ensureLatestSettings()

      const file = JSON.parse(readFileSync(settingsPath, 'utf-8'))

      // Extra keys preserved
      expect(file.desktop?.zoomLevel).toBe(1.5)
      expect(file.lastUpdateCheck).toBe(1234567890)
    })

    test('always writes file and sets schema version', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          server: { port: 7777 },
          // No schema version
        })
      )

      const { ensureLatestSettings, ensureFulcrumDir } = await import('./settings')
      ensureFulcrumDir()
      ensureLatestSettings()

      const file = JSON.parse(readFileSync(settingsPath, 'utf-8'))

      // Schema version should be set to current
      expect(file._schemaVersion).toBe(1)
    })

    test('creates settings file with all defaults if none exists', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      expect(existsSync(settingsPath)).toBe(false)

      const { ensureLatestSettings, ensureFulcrumDir } = await import('./settings')
      ensureFulcrumDir()
      ensureLatestSettings()

      expect(existsSync(settingsPath)).toBe(true)
      const file = JSON.parse(readFileSync(settingsPath, 'utf-8'))

      // All default sections should exist
      expect(file._schemaVersion).toBe(1)
      expect(file.server.port).toBe(7777)
      expect(file.editor.app).toBe('vscode')
      expect(file.notifications.enabled).toBe(true)
      expect(file.zai.enabled).toBe(false)
    })

    test('handles missing notifications section', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          _schemaVersion: 7,
          server: { port: 7777 },
          // No notifications section
        })
      )

      const { ensureLatestSettings, ensureFulcrumDir } = await import('./settings')
      ensureFulcrumDir()
      ensureLatestSettings()

      const file = JSON.parse(readFileSync(settingsPath, 'utf-8'))

      // Notifications should be added with defaults
      expect(file.notifications).toBeDefined()
      expect(file.notifications.enabled).toBe(true)
      expect(file.notifications.sound.enabled).toBe(true)
      expect(file.notifications.slack.enabled).toBe(false)
    })

    test('handles missing zai section', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          _schemaVersion: 7,
          server: { port: 7777 },
          // No zai section
        })
      )

      const { ensureLatestSettings, ensureFulcrumDir } = await import('./settings')
      ensureFulcrumDir()
      ensureLatestSettings()

      const file = JSON.parse(readFileSync(settingsPath, 'utf-8'))

      // zai should be added with defaults
      expect(file.zai).toBeDefined()
      expect(file.zai.enabled).toBe(false)
      expect(file.zai.apiKey).toBeNull()
      expect(file.zai.haikuModel).toBe('glm-4.5-air')
    })
  })

  describe('agent settings', () => {
    test('returns default agent as claude when not configured', async () => {
      const { getSettings, ensureFulcrumDir } = await import('./settings')
      ensureFulcrumDir()
      const settings = getSettings()

      expect(settings.agent.defaultAgent).toBe('claude')
    })

    test('reads agent.defaultAgent from file', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          _schemaVersion: 8,
          agent: { defaultAgent: 'opencode' },
        })
      )

      const { getSettings } = await import('./settings')
      const settings = getSettings()

      expect(settings.agent.defaultAgent).toBe('opencode')
    })

    test('updates agent.defaultAgent via updateSettingByPath', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          _schemaVersion: 8,
          agent: { defaultAgent: 'claude' },
        })
      )

      const { updateSettingByPath, getSettings } = await import('./settings')
      updateSettingByPath('agent.defaultAgent', 'opencode')

      const settings = getSettings()
      expect(settings.agent.defaultAgent).toBe('opencode')

      // Verify persistence
      const file = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      expect(file.agent.defaultAgent).toBe('opencode')
    })

    test('ensureLatestSettings adds missing agent section', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          _schemaVersion: 7, // Old version without agent section
          server: { port: 7777 },
        })
      )

      const { ensureLatestSettings, ensureFulcrumDir } = await import('./settings')
      ensureFulcrumDir()
      ensureLatestSettings()

      const file = JSON.parse(readFileSync(settingsPath, 'utf-8'))

      // Agent section should be added with defaults
      expect(file.agent).toBeDefined()
      expect(file.agent.defaultAgent).toBe('claude')
    })
  })

  describe('task settings', () => {
    test('returns default task settings when not configured', async () => {
      const { getSettings, ensureFulcrumDir } = await import('./settings')
      ensureFulcrumDir()
      const settings = getSettings()

      expect(settings.tasks.defaultTaskType).toBe('code')
      expect(settings.tasks.startCodeTasksImmediately).toBe(true)
    })

    test('reads task settings from file', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          _schemaVersion: 1,
          tasks: {
            defaultTaskType: 'non-code',
            startCodeTasksImmediately: false,
          },
        })
      )

      const { getSettings } = await import('./settings')
      const settings = getSettings()

      expect(settings.tasks.defaultTaskType).toBe('non-code')
      expect(settings.tasks.startCodeTasksImmediately).toBe(false)
    })

    test('updates task settings via updateSettingByPath', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          _schemaVersion: 1,
          tasks: {
            defaultTaskType: 'code',
            startCodeTasksImmediately: true,
          },
        })
      )

      const { updateSettingByPath, getSettings } = await import('./settings')

      updateSettingByPath('tasks.defaultTaskType', 'non-code')
      let settings = getSettings()
      expect(settings.tasks.defaultTaskType).toBe('non-code')

      updateSettingByPath('tasks.startCodeTasksImmediately', false)
      settings = getSettings()
      expect(settings.tasks.startCodeTasksImmediately).toBe(false)

      // Verify persistence
      const file = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      expect(file.tasks.defaultTaskType).toBe('non-code')
      expect(file.tasks.startCodeTasksImmediately).toBe(false)
    })

    test('ensureLatestSettings adds missing tasks section', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          _schemaVersion: 1,
          server: { port: 7777 },
          // No tasks section
        })
      )

      const { ensureLatestSettings, ensureFulcrumDir } = await import('./settings')
      ensureFulcrumDir()
      ensureLatestSettings()

      const file = JSON.parse(readFileSync(settingsPath, 'utf-8'))

      // Tasks section should be added with defaults
      expect(file.tasks).toBeDefined()
      expect(file.tasks.defaultTaskType).toBe('code')
      expect(file.tasks.startCodeTasksImmediately).toBe(true)
    })

    test('preserves existing task settings in ensureLatestSettings', async () => {
      const settingsPath = join(tempDir, 'settings.json')
      writeFileSync(
        settingsPath,
        JSON.stringify({
          _schemaVersion: 1,
          server: { port: 7777 },
          tasks: {
            defaultTaskType: 'non-code',
            // Missing startCodeTasksImmediately
          },
        })
      )

      const { ensureLatestSettings, ensureFulcrumDir } = await import('./settings')
      ensureFulcrumDir()
      ensureLatestSettings()

      const file = JSON.parse(readFileSync(settingsPath, 'utf-8'))

      // User value preserved
      expect(file.tasks.defaultTaskType).toBe('non-code')
      // Missing key added with default
      expect(file.tasks.startCodeTasksImmediately).toBe(true)
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
