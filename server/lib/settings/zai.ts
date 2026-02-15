import type { ZAiSettings } from './types'
import { getFnoxValue, setFnoxValue } from './fnox'

export const DEFAULT_ZAI_SETTINGS: ZAiSettings = {
  enabled: false,
  apiKey: null,
  haikuModel: 'glm-4.5-air',
  sonnetModel: 'glm-4.7',
  opusModel: 'glm-4.7',
}

// Get z.ai settings from fnox
export function getZAiSettings(): ZAiSettings {
  const fv = (path: string): unknown => getFnoxValue(path)

  return {
    enabled: (fv('zai.enabled') as boolean | null) ?? DEFAULT_ZAI_SETTINGS.enabled,
    apiKey: (fv('zai.apiKey') as string | null) ?? null,
    haikuModel: (fv('zai.haikuModel') as string) ?? DEFAULT_ZAI_SETTINGS.haikuModel,
    sonnetModel: (fv('zai.sonnetModel') as string) ?? DEFAULT_ZAI_SETTINGS.sonnetModel,
    opusModel: (fv('zai.opusModel') as string) ?? DEFAULT_ZAI_SETTINGS.opusModel,
  }
}

// Update z.ai settings — writes to fnox
export function updateZAiSettings(updates: Partial<ZAiSettings>): ZAiSettings {
  const current = getZAiSettings()
  const updated: ZAiSettings = {
    enabled: updates.enabled ?? current.enabled,
    apiKey: updates.apiKey !== undefined ? updates.apiKey : current.apiKey,
    haikuModel: updates.haikuModel ?? current.haikuModel,
    sonnetModel: updates.sonnetModel ?? current.sonnetModel,
    opusModel: updates.opusModel ?? current.opusModel,
  }

  setFnoxValue('zai.enabled', updated.enabled)
  setFnoxValue('zai.apiKey', updated.apiKey)
  setFnoxValue('zai.haikuModel', updated.haikuModel)
  setFnoxValue('zai.sonnetModel', updated.sonnetModel)
  setFnoxValue('zai.opusModel', updated.opusModel)

  // Return the full settings for the caller
  return getZAiSettings()
}
