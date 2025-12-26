import { spawn } from 'child_process'
import {
  getNotificationSettings,
  type NotificationSettings,
  type SoundNotificationConfig,
  type SlackNotificationConfig,
  type DiscordNotificationConfig,
  type PushoverNotificationConfig,
} from '../lib/settings'
import { broadcast } from '../websocket/terminal-ws'
import { log } from '../lib/logger'

export interface NotificationPayload {
  title: string
  message: string
  taskId?: string
  taskTitle?: string
  type: 'task_status_change' | 'pr_merged' | 'plan_complete'
  url?: string
}

export interface NotificationResult {
  channel: string
  success: boolean
  error?: string
}

// Play notification sound via frontend (web audio)
// The server just signals to play; the frontend handles actual playback
async function sendSoundNotification(
  _config: SoundNotificationConfig
): Promise<NotificationResult> {
  // Sound is played by the frontend via WebSocket notification
  // This function exists for the test endpoint
  return { channel: 'sound', success: true }
}

// Send Slack notification via webhook
async function sendSlackNotification(
  config: SlackNotificationConfig,
  payload: NotificationPayload
): Promise<NotificationResult> {
  if (!config.webhookUrl) {
    return { channel: 'slack', success: false, error: 'Webhook URL not configured' }
  }

  try {
    const blocks = [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${payload.title}*\n${payload.message}` },
      },
    ]

    if (payload.url) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `<${payload.url}|View Task>` },
      })
    }

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: payload.title, blocks }),
    })

    if (response.ok) {
      return { channel: 'slack', success: true }
    } else {
      return { channel: 'slack', success: false, error: `HTTP ${response.status}` }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { channel: 'slack', success: false, error: message }
  }
}

// Send Discord notification via webhook
async function sendDiscordNotification(
  config: DiscordNotificationConfig,
  payload: NotificationPayload
): Promise<NotificationResult> {
  if (!config.webhookUrl) {
    return { channel: 'discord', success: false, error: 'Webhook URL not configured' }
  }

  try {
    const embed = {
      title: payload.title,
      description: payload.message,
      color: 0x5865f2, // Discord blurple
      url: payload.url,
    }

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    })

    if (response.ok || response.status === 204) {
      return { channel: 'discord', success: true }
    } else {
      return { channel: 'discord', success: false, error: `HTTP ${response.status}` }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { channel: 'discord', success: false, error: message }
  }
}

// Send Pushover notification via API
async function sendPushoverNotification(
  config: PushoverNotificationConfig,
  payload: NotificationPayload
): Promise<NotificationResult> {
  if (!config.appToken || !config.userKey) {
    return { channel: 'pushover', success: false, error: 'App token or user key not configured' }
  }

  try {
    const body: Record<string, string> = {
      token: config.appToken,
      user: config.userKey,
      title: payload.title,
      message: payload.message,
    }

    if (payload.url) {
      body.url = payload.url
      body.url_title = 'View Task'
    }

    const response = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (response.ok) {
      return { channel: 'pushover', success: true }
    } else {
      const text = await response.text()
      return { channel: 'pushover', success: false, error: `HTTP ${response.status}: ${text}` }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { channel: 'pushover', success: false, error: message }
  }
}

// Broadcast notification to UI via WebSocket
function broadcastUINotification(payload: NotificationPayload, playSound: boolean): void {
  const notificationType =
    payload.type === 'pr_merged' || payload.type === 'plan_complete' ? 'success' : 'info'

  broadcast({
    type: 'notification',
    payload: {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: payload.title,
      message: payload.message,
      notificationType,
      taskId: payload.taskId,
      playSound, // Tell desktop app to play local sound
    },
  })
}

// Send notification to all enabled channels
export async function sendNotification(payload: NotificationPayload): Promise<NotificationResult[]> {
  const settings = getNotificationSettings()

  if (!settings.enabled) {
    return []
  }

  const results: NotificationResult[] = []
  const promises: Promise<void>[] = []

  // Determine if sound should be played
  // Pass this to UI so desktop app can play sound locally
  const playSound = settings.sound?.enabled ?? false

  // Always broadcast to UI (with sound flag for desktop app)
  broadcastUINotification(payload, playSound)

  // Sound (macOS only)
  if (settings.sound?.enabled) {
    promises.push(
      sendSoundNotification(settings.sound)
        .then((r) => results.push(r))
        .catch((e) => results.push({ channel: 'sound', success: false, error: e.message }))
    )
  }

  // Slack
  if (settings.slack?.enabled) {
    promises.push(
      sendSlackNotification(settings.slack, payload)
        .then((r) => results.push(r))
        .catch((e) => results.push({ channel: 'slack', success: false, error: e.message }))
    )
  }

  // Discord
  if (settings.discord?.enabled) {
    promises.push(
      sendDiscordNotification(settings.discord, payload)
        .then((r) => results.push(r))
        .catch((e) => results.push({ channel: 'discord', success: false, error: e.message }))
    )
  }

  // Pushover
  if (settings.pushover?.enabled) {
    promises.push(
      sendPushoverNotification(settings.pushover, payload)
        .then((r) => results.push(r))
        .catch((e) => results.push({ channel: 'pushover', success: false, error: e.message }))
    )
  }

  await Promise.allSettled(promises)

  // Log failures
  for (const result of results) {
    if (!result.success) {
      log.notification.warn('Notification failed', { channel: result.channel, error: result.error })
    }
  }

  return results
}

// Test a specific notification channel
export async function testNotificationChannel(
  channel: 'sound' | 'slack' | 'discord' | 'pushover',
  settings?: NotificationSettings
): Promise<NotificationResult> {
  const config = settings ?? getNotificationSettings()
  const testPayload: NotificationPayload = {
    title: 'Test Notification',
    message: 'This is a test notification from Vibora.',
    type: 'task_status_change',
  }

  switch (channel) {
    case 'sound':
      return sendSoundNotification(config.sound)
    case 'slack':
      return sendSlackNotification(config.slack, testPayload)
    case 'discord':
      return sendDiscordNotification(config.discord, testPayload)
    case 'pushover':
      return sendPushoverNotification(config.pushover, testPayload)
    default:
      return { channel, success: false, error: 'Unknown channel' }
  }
}
