import { log } from '../logger'
import type { NotificationSettings, NotificationSettingsUpdateResult } from './types'
import { getFnoxValue, setFnoxValue } from './fnox'

// Simple mutex for synchronizing settings access
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

// Get notification settings from fnox
export function getNotificationSettings(): NotificationSettings {
  const fv = (path: string): unknown => getFnoxValue(path)

  const result: NotificationSettings = {
    enabled: (fv('notifications.enabled') as boolean | null) ?? DEFAULT_NOTIFICATION_SETTINGS.enabled,
    toast: {
      enabled: (fv('notifications.toast.enabled') as boolean | null) ?? true,
    },
    desktop: {
      enabled: (fv('notifications.desktop.enabled') as boolean | null) ?? true,
    },
    sound: {
      enabled: (fv('notifications.sound.enabled') as boolean | null) ?? true,
      customSoundFile: (fv('notifications.sound.customSoundFile') as string | undefined) ?? undefined,
    },
    slack: {
      enabled: (fv('notifications.slack.enabled') as boolean | null) ?? false,
      webhookUrl: (fv('notifications.slack.webhookUrl') as string | undefined) ?? undefined,
      useMessagingChannel: (fv('notifications.slack.useMessagingChannel') as boolean | undefined) ?? undefined,
    },
    discord: {
      enabled: (fv('notifications.discord.enabled') as boolean | null) ?? false,
      webhookUrl: (fv('notifications.discord.webhookUrl') as string | undefined) ?? undefined,
      useMessagingChannel: (fv('notifications.discord.useMessagingChannel') as boolean | undefined) ?? undefined,
    },
    pushover: {
      enabled: (fv('notifications.pushover.enabled') as boolean | null) ?? false,
      appToken: (fv('notifications.pushover.appToken') as string | undefined) ?? undefined,
      userKey: (fv('notifications.pushover.userKey') as string | undefined) ?? undefined,
    },
    whatsapp: {
      enabled: (fv('notifications.whatsapp.enabled') as boolean | null) ?? false,
    },
    telegram: {
      enabled: (fv('notifications.telegram.enabled') as boolean | null) ?? false,
    },
    gmail: {
      enabled: (fv('notifications.gmail.enabled') as boolean | null) ?? false,
      googleAccountId: (fv('notifications.gmail.googleAccountId') as string | undefined) ?? undefined,
    },
    _updatedAt: (fv('notifications._updatedAt') as number | null) ?? undefined,
  }

  // Ensure _updatedAt is set if missing
  if (result._updatedAt === undefined) {
    const timestamp = Date.now()
    setFnoxValue('notifications._updatedAt', timestamp)
    result._updatedAt = timestamp
  }

  return result
}

// Update notification settings with optional optimistic locking
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
  const current = getNotificationSettings()

  // Log incoming update for debugging
  if (updates.enabled !== undefined) {
    log.settings.info('Notification enabled state change requested', {
      clientTimestamp,
      serverTimestamp: current._updatedAt,
      currentEnabled: current.enabled,
      requestedEnabled: updates.enabled,
      hasTimestamp: clientTimestamp !== undefined,
    })
  }

  // Check for stale update (optimistic locking)
  if (current._updatedAt !== undefined) {
    if (clientTimestamp === undefined) {
      log.settings.warn('Notification settings update without timestamp (no optimistic lock)', {
        serverTimestamp: current._updatedAt,
        attemptedChanges: updates,
      })
    } else if (clientTimestamp !== current._updatedAt) {
      log.settings.warn('Rejected stale notification settings update', {
        clientTimestamp,
        serverTimestamp: current._updatedAt,
        attemptedChanges: updates,
      })
      return { conflict: true, current }
    }
  }

  // Merge updates
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

  // Write all notification fields to fnox (updates cache; CLI writes only when available)
  setFnoxValue('notifications.enabled', updated.enabled)
  setFnoxValue('notifications.toast.enabled', updated.toast.enabled)
  setFnoxValue('notifications.desktop.enabled', updated.desktop.enabled)
  setFnoxValue('notifications.sound.enabled', updated.sound.enabled)
  if (updated.sound.customSoundFile !== undefined) {
    setFnoxValue('notifications.sound.customSoundFile', updated.sound.customSoundFile || null)
  }
  setFnoxValue('notifications.slack.enabled', updated.slack.enabled)
  if (updated.slack.webhookUrl !== undefined) {
    setFnoxValue('notifications.slack.webhookUrl', updated.slack.webhookUrl || null)
  }
  if (updated.slack.useMessagingChannel !== undefined) {
    setFnoxValue('notifications.slack.useMessagingChannel', updated.slack.useMessagingChannel)
  }
  setFnoxValue('notifications.discord.enabled', updated.discord.enabled)
  if (updated.discord.webhookUrl !== undefined) {
    setFnoxValue('notifications.discord.webhookUrl', updated.discord.webhookUrl || null)
  }
  if (updated.discord.useMessagingChannel !== undefined) {
    setFnoxValue('notifications.discord.useMessagingChannel', updated.discord.useMessagingChannel)
  }
  setFnoxValue('notifications.pushover.enabled', updated.pushover.enabled)
  if (updated.pushover.appToken !== undefined) {
    setFnoxValue('notifications.pushover.appToken', updated.pushover.appToken || null)
  }
  if (updated.pushover.userKey !== undefined) {
    setFnoxValue('notifications.pushover.userKey', updated.pushover.userKey || null)
  }
  setFnoxValue('notifications.whatsapp.enabled', updated.whatsapp.enabled)
  setFnoxValue('notifications.telegram.enabled', updated.telegram.enabled)
  setFnoxValue('notifications.gmail.enabled', updated.gmail.enabled)
  if (updated.gmail.googleAccountId !== undefined) {
    setFnoxValue('notifications.gmail.googleAccountId', updated.gmail.googleAccountId || null)
  }
  setFnoxValue('notifications._updatedAt', updated._updatedAt)

  // Log what changed
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  if (updates.enabled !== undefined && updates.enabled !== current.enabled) {
    changes.enabled = { from: current.enabled, to: updates.enabled }
    if (updates.enabled === false) {
      log.settings.warn('Notifications being DISABLED', {
        from: current.enabled,
        to: updates.enabled,
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
