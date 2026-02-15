import * as fs from 'fs'
import type { ZAiSettings } from './types'
import { ensureFulcrumDir, getSettingsPath } from './paths'
import { getFnoxSecret, isFnoxAvailable, setFnoxSecret, removeFnoxSecret } from './fnox'

// ==================== z.ai Settings ====================
// These settings control the z.ai proxy integration for Claude Code

export const DEFAULT_ZAI_SETTINGS: ZAiSettings = {
  enabled: false,
  apiKey: null,
  haikuModel: 'glm-4.5-air',
  sonnetModel: 'glm-4.7',
  opusModel: 'glm-4.7',
}

// Get z.ai settings from settings.json
export function getZAiSettings(): ZAiSettings {
  ensureFulcrumDir()
  const settingsPath = getSettingsPath()

  if (!fs.existsSync(settingsPath)) {
    return DEFAULT_ZAI_SETTINGS
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf-8')
    const parsed = JSON.parse(content)
    const zai = parsed.zai as Partial<ZAiSettings> | undefined

    if (!zai) {
      return DEFAULT_ZAI_SETTINGS
    }

    const result: ZAiSettings = {
      enabled: zai.enabled ?? false,
      apiKey: zai.apiKey ?? null,
      haikuModel: zai.haikuModel ?? DEFAULT_ZAI_SETTINGS.haikuModel,
      sonnetModel: zai.sonnetModel ?? DEFAULT_ZAI_SETTINGS.sonnetModel,
      opusModel: zai.opusModel ?? DEFAULT_ZAI_SETTINGS.opusModel,
    }

    // Overlay fnox secret
    const fnoxApiKey = getFnoxSecret('zai.apiKey')
    if (fnoxApiKey) result.apiKey = fnoxApiKey

    return result
  } catch {
    return DEFAULT_ZAI_SETTINGS
  }
}

// Update z.ai settings
export function updateZAiSettings(updates: Partial<ZAiSettings>): ZAiSettings {
  ensureFulcrumDir()
  const settingsPath = getSettingsPath()

  let parsed: Record<string, unknown> = {}
  if (fs.existsSync(settingsPath)) {
    try {
      parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    } catch {
      // Use empty if invalid
    }
  }

  const current = getZAiSettings()
  const updated: ZAiSettings = {
    enabled: updates.enabled ?? current.enabled,
    apiKey: updates.apiKey !== undefined ? updates.apiKey : current.apiKey,
    haikuModel: updates.haikuModel ?? current.haikuModel,
    sonnetModel: updates.sonnetModel ?? current.sonnetModel,
    opusModel: updates.opusModel ?? current.opusModel,
  }

  // Route apiKey through fnox
  if (isFnoxAvailable()) {
    if (updated.apiKey && updated.apiKey.trim() !== '') {
      setFnoxSecret('zai.apiKey', updated.apiKey)
      updated.apiKey = null // Don't persist in settings.json
    } else {
      removeFnoxSecret('zai.apiKey')
      updated.apiKey = null
    }
  }

  parsed.zai = updated
  fs.writeFileSync(settingsPath, JSON.stringify(parsed, null, 2), 'utf-8')

  // Return the full settings (with fnox overlay) for the caller
  return getZAiSettings()
}
