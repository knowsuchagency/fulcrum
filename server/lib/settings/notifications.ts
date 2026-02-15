import * as fs from 'fs'
import { log } from '../logger'
import type { NotificationSettings, NotificationSettingsUpdateResult } from './types'
import { ensureFulcrumDir, getSettingsPath } from './paths'
import { getFnoxSecret, isFnoxAvailable, setFnoxSecret, removeFnoxSecret } from './fnox'

// Simple mutex for synchronizing settings file access
let notificationSettingsLock: Promise<void> = Promise.resolve()

export function withNotificationSettingsLock<T>(fn: () => T): Promise<T> {
  const previousLock = notificationSettingsLock
  let releaseLock: () => void
  notificationSettingsLock = new Promise((resolve) => {
    releaseLock = resolve
  })
  return previousLock.then(() => {
    try {
      return fn()
    } finally {
      releaseLock()
    }
  })
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  toast: { enabled: true },
  desktop: { enabled: true },
  sound: { enabled: true },
  slack: { enabled: false },
  discord: { enabled: false },
  pushover: { enabled: false },
  whatsapp: { enabled: false },
  telegram: { enabled: false },
  gmail: { enabled: false },
}

// Get notification settings from settings.json
export function getNotificationSettings(): NotificationSettings {
  ensureFulcrumDir()
  const settingsPath = getSettingsPath()

  if (!fs.existsSync(settingsPath)) {
    // Initialize settings file with defaults including timestamp
    const defaultSettings = { ...DEFAULT_NOTIFICATION_SETTINGS, _updatedAt: Date.now() }
    fs.writeFileSync(settingsPath, JSON.stringify({ notifications: defaultSettings }, null, 2), 'utf-8')
    return defaultSettings
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf-8')
    const parsed = JSON.parse(content) as Record<string, unknown>
    const notifications = parsed.notifications as Partial<NotificationSettings> | undefined

    if (!notifications) {
      // Initialize notifications with defaults including timestamp
      const defaultSettings = { ...DEFAULT_NOTIFICATION_SETTINGS, _updatedAt: Date.now() }
      parsed.notifications = defaultSettings
      fs.writeFileSync(settingsPath, JSON.stringify(parsed, null, 2), 'utf-8')
      return defaultSettings
    }

    // If _updatedAt is missing, add it and save to ensure consistency
    if (notifications._updatedAt === undefined) {
      const timestamp = Date.now()
      notifications._updatedAt = timestamp
      parsed.notifications = notifications
      fs.writeFileSync(settingsPath, JSON.stringify(parsed, null, 2), 'utf-8')
    }

    const result: NotificationSettings = {
      enabled: notifications.enabled ?? true,
      toast: { enabled: true, ...notifications.toast },
      desktop: { enabled: true, ...notifications.desktop },
      sound: { enabled: false, ...notifications.sound },
      slack: { enabled: false, ...notifications.slack },
      discord: { enabled: false, ...notifications.discord },
      pushover: { enabled: false, ...notifications.pushover },
      whatsapp: { enabled: false, ...notifications.whatsapp },
      telegram: { enabled: false, ...notifications.telegram },
      gmail: { enabled: false, ...notifications.gmail },
      _updatedAt: notifications._updatedAt!,
    }

    // Overlay fnox secrets
    const pushoverAppToken = getFnoxSecret('notifications.pushover.appToken')
    if (pushoverAppToken) result.pushover.appToken = pushoverAppToken
    const pushoverUserKey = getFnoxSecret('notifications.pushover.userKey')
    if (pushoverUserKey) result.pushover.userKey = pushoverUserKey
    const slackWebhookUrl = getFnoxSecret('notifications.slack.webhookUrl')
    if (slackWebhookUrl) result.slack.webhookUrl = slackWebhookUrl
    const discordWebhookUrl = getFnoxSecret('notifications.discord.webhookUrl')
    if (discordWebhookUrl) result.discord.webhookUrl = discordWebhookUrl

    return result
  } catch {
    // File is corrupt, reinitialize with defaults
    const defaultSettings = { ...DEFAULT_NOTIFICATION_SETTINGS, _updatedAt: Date.now() }
    fs.writeFileSync(settingsPath, JSON.stringify({ notifications: defaultSettings }, null, 2), 'utf-8')
    return defaultSettings
  }
}

// Update notification settings with optional optimistic locking
// If clientTimestamp is provided and doesn't match current _updatedAt, returns conflict
// Uses a mutex to prevent race conditions between concurrent requests
export function updateNotificationSettings(
  updates: Partial<NotificationSettings>,
  clientTimestamp?: number
): Promise<NotificationSettingsUpdateResult> {
  return withNotificationSettingsLock(() => updateNotificationSettingsSync(updates, clientTimestamp))
}

// Internal sync version - must be called within the lock
export function updateNotificationSettingsSync(
  updates: Partial<NotificationSettings>,
  clientTimestamp?: number
): NotificationSettingsUpdateResult {
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

  const current = getNotificationSettings()

  // Log incoming update for debugging - always log when enabled is being changed
  if (updates.enabled !== undefined) {
    log.settings.info('Notification enabled state change requested', {
      clientTimestamp,
      serverTimestamp: current._updatedAt,
      currentEnabled: current.enabled,
      requestedEnabled: updates.enabled,
      hasTimestamp: clientTimestamp !== undefined,
      stack: new Error().stack,
    })
  }

  // Check for stale update (optimistic locking)
  if (current._updatedAt !== undefined) {
    if (clientTimestamp === undefined) {
      // Client didn't send timestamp - log warning but allow (for CLI compatibility)
      log.settings.warn('Notification settings update without timestamp (no optimistic lock)', {
        serverTimestamp: current._updatedAt,
        attemptedChanges: updates,
        stack: new Error().stack,
      })
      // Allow the update but we've logged it
    } else if (clientTimestamp !== current._updatedAt) {
      log.settings.warn('Rejected stale notification settings update', {
        clientTimestamp,
        serverTimestamp: current._updatedAt,
        attemptedChanges: updates,
      })
      return { conflict: true, current }
    }
  }

  const updated: NotificationSettings = {
    enabled: updates.enabled ?? current.enabled,
    toast: { ...current.toast, ...updates.toast },
    desktop: { ...current.desktop, ...updates.desktop },
    sound: { ...current.sound, ...updates.sound },
    slack: { ...current.slack, ...updates.slack },
    discord: { ...current.discord, ...updates.discord },
    pushover: { ...current.pushover, ...updates.pushover },
    whatsapp: { ...current.whatsapp, ...updates.whatsapp },
    telegram: { ...current.telegram, ...updates.telegram },
    gmail: { ...current.gmail, ...updates.gmail },
    _updatedAt: Date.now(),
  }

  // Route secrets through fnox before writing to settings.json
  if (isFnoxAvailable()) {
    const secretFields: Array<{ path: string; obj: Record<string, unknown>; key: string }> = [
      { path: 'notifications.pushover.appToken', obj: updated.pushover as Record<string, unknown>, key: 'appToken' },
      { path: 'notifications.pushover.userKey', obj: updated.pushover as Record<string, unknown>, key: 'userKey' },
      { path: 'notifications.slack.webhookUrl', obj: updated.slack as Record<string, unknown>, key: 'webhookUrl' },
      { path: 'notifications.discord.webhookUrl', obj: updated.discord as Record<string, unknown>, key: 'webhookUrl' },
    ]
    for (const { path, obj, key } of secretFields) {
      const value = obj[key]
      if (value && typeof value === 'string' && value.trim() !== '') {
        setFnoxSecret(path, value as string)
        obj[key] = undefined // Don't persist in settings.json
      } else if (value === '' || value === null) {
        removeFnoxSecret(path)
        obj[key] = undefined
      }
    }
  }

  parsed.notifications = updated
  fs.writeFileSync(settingsPath, JSON.stringify(parsed, null, 2), 'utf-8')

  // Log what changed
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  if (updates.enabled !== undefined && updates.enabled !== current.enabled) {
    changes.enabled = { from: current.enabled, to: updates.enabled }
    // Log with stack trace when notifications are being disabled
    if (updates.enabled === false) {
      log.settings.warn('Notifications being DISABLED', {
        from: current.enabled,
        to: updates.enabled,
        stack: new Error().stack,
      })
    }
  }
  if (updates.toast?.enabled !== undefined && updates.toast.enabled !== current.toast.enabled) {
    changes['toast.enabled'] = { from: current.toast.enabled, to: updates.toast.enabled }
  }
  if (updates.desktop?.enabled !== undefined && updates.desktop.enabled !== current.desktop.enabled) {
    changes['desktop.enabled'] = { from: current.desktop.enabled, to: updates.desktop.enabled }
  }
  if (updates.sound?.enabled !== undefined && updates.sound.enabled !== current.sound.enabled) {
    changes['sound.enabled'] = { from: current.sound.enabled, to: updates.sound.enabled }
  }
  if (updates.slack?.enabled !== undefined && updates.slack.enabled !== current.slack.enabled) {
    changes['slack.enabled'] = { from: current.slack.enabled, to: updates.slack.enabled }
  }
  if (updates.discord?.enabled !== undefined && updates.discord.enabled !== current.discord.enabled) {
    changes['discord.enabled'] = { from: current.discord.enabled, to: updates.discord.enabled }
  }
  if (updates.pushover?.enabled !== undefined && updates.pushover.enabled !== current.pushover.enabled) {
    changes['pushover.enabled'] = { from: current.pushover.enabled, to: updates.pushover.enabled }
  }
  if (updates.whatsapp?.enabled !== undefined && updates.whatsapp.enabled !== current.whatsapp.enabled) {
    changes['whatsapp.enabled'] = { from: current.whatsapp.enabled, to: updates.whatsapp.enabled }
  }
  if (updates.telegram?.enabled !== undefined && updates.telegram.enabled !== current.telegram.enabled) {
    changes['telegram.enabled'] = { from: current.telegram.enabled, to: updates.telegram.enabled }
  }
  if (updates.gmail?.enabled !== undefined && updates.gmail.enabled !== current.gmail.enabled) {
    changes['gmail.enabled'] = { from: current.gmail.enabled, to: updates.gmail.enabled }
  }
  if (Object.keys(changes).length > 0) {
    log.settings.info('Notification settings updated', { changes })
  }

  return updated
}
