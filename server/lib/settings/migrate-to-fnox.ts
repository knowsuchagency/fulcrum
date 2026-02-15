import * as fs from 'fs'
import { join } from 'path'
import { log } from '../logger'
import { getFulcrumDir } from './paths'
import { getNestedValue } from './migration'
import { FNOX_CONFIG_MAP, setFnoxValue, isFnoxAvailable } from './fnox'
import { DEFAULT_SETTINGS } from './types'
import { DEFAULT_NOTIFICATION_SETTINGS } from './notifications'
import { DEFAULT_ZAI_SETTINGS } from './zai'

/**
 * Migrate settings.json → fnox.
 *
 * Called on server startup. If settings.json exists:
 * 1. Parse all known values
 * 2. Write non-default values to fnox with correct providers
 * 3. Handle nested notification and zai sections
 * 4. Rename settings.json → settings.json.migrated
 */
export function migrateSettingsJsonToFnox(): void {
  if (!isFnoxAvailable()) return

  const fulcrumDir = getFulcrumDir()
  const settingsPath = join(fulcrumDir, 'settings.json')

  if (!fs.existsSync(settingsPath)) return

  let parsed: Record<string, unknown>
  try {
    const content = fs.readFileSync(settingsPath, 'utf-8')
    parsed = JSON.parse(content)
  } catch {
    log.settings.warn('Could not parse settings.json for migration, skipping')
    return
  }

  log.settings.info('Migrating settings.json to fnox...')
  let migrated = 0

  // Build a merged defaults object that includes all sections
  const allDefaults: Record<string, unknown> = {
    ...DEFAULT_SETTINGS as unknown as Record<string, unknown>,
    notifications: DEFAULT_NOTIFICATION_SETTINGS as unknown as Record<string, unknown>,
    zai: DEFAULT_ZAI_SETTINGS as unknown as Record<string, unknown>,
  }

  for (const [settingsPath, entry] of Object.entries(FNOX_CONFIG_MAP)) {
    // Skip internal keys
    if (settingsPath === '_schemaVersion') continue

    const value = getNestedValue(parsed, settingsPath)
    if (value === undefined || value === null) continue

    // Get the default value for comparison
    const defaultValue = getNestedValue(allDefaults, settingsPath)

    // Skip if value matches default (no need to store defaults)
    if (value === defaultValue) continue

    // Skip empty strings that match empty defaults
    if (typeof value === 'string' && value === '' && (defaultValue === '' || defaultValue === null)) continue

    try {
      setFnoxValue(settingsPath, value)
      migrated++
    } catch (err) {
      log.settings.warn('Failed to migrate setting to fnox', {
        path: settingsPath,
        fnoxKey: entry.fnoxKey,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Rename settings.json to .migrated
  const migratedPath = join(fulcrumDir, 'settings.json.migrated')
  try {
    fs.renameSync(settingsPath, migratedPath)
  } catch {
    // If rename fails (e.g., cross-device), try copy + delete
    try {
      fs.copyFileSync(settingsPath, migratedPath)
      fs.unlinkSync(settingsPath)
    } catch {
      log.settings.warn('Could not rename settings.json after migration')
    }
  }

  log.settings.info('Settings migration complete', {
    migrated,
    settingsRenamed: !fs.existsSync(settingsPath),
  })
}
