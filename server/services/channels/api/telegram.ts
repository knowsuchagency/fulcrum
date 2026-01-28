/**
 * Telegram API - Functions for managing Telegram channel configuration and state.
 * Configuration stored in settings.json under channels.telegram.
 */

import { getSettings, updateSettingByPath } from '../../../lib/settings'
import {
  activeChannels,
  TELEGRAM_CONNECTION_ID,
  startTelegramChannel,
  stopTelegramChannel,
} from '../channel-manager'
import type { ConnectionStatus } from '../types'

// Re-export connection ID for backward compatibility
export { TELEGRAM_CONNECTION_ID } from '../channel-manager'

/**
 * Configure Telegram with a bot token and enable the channel.
 * Saves configuration to settings.json and starts the channel.
 */
export async function configureTelegram(botToken: string): Promise<{
  enabled: boolean
  status: ConnectionStatus
}> {
  // Stop existing channel if running
  await stopTelegramChannel()

  // Save to settings
  updateSettingByPath('channels.telegram.enabled', true)
  updateSettingByPath('channels.telegram.botToken', botToken)

  // Start the channel
  await startTelegramChannel()

  // Get the active channel reference after starting
  const channel = activeChannels.get(TELEGRAM_CONNECTION_ID)

  return {
    enabled: true,
    status: channel?.getStatus() || 'connecting',
  }
}

/**
 * Enable Telegram using existing credentials from settings.
 */
export async function enableTelegram(): Promise<{
  enabled: boolean
  status: ConnectionStatus
  error?: string
}> {
  const settings = getSettings()
  const telegramConfig = settings.channels.telegram

  if (!telegramConfig.botToken) {
    return {
      enabled: false,
      status: 'credentials_required',
      error: 'Telegram bot token not configured.',
    }
  }

  // Stop existing channel if running
  await stopTelegramChannel()

  // Update settings to enable
  updateSettingByPath('channels.telegram.enabled', true)

  // Start the channel
  await startTelegramChannel()

  // Get the active channel reference after starting
  const channel = activeChannels.get(TELEGRAM_CONNECTION_ID)

  return {
    enabled: true,
    status: channel?.getStatus() || 'connecting',
  }
}

/**
 * Disable Telegram and stop the channel.
 */
export async function disableTelegram(): Promise<{
  enabled: boolean
  status: ConnectionStatus
}> {
  await stopTelegramChannel()

  // Update settings to disable
  updateSettingByPath('channels.telegram.enabled', false)

  return {
    enabled: false,
    status: 'disconnected',
  }
}

/**
 * Disconnect Telegram (clear credentials from settings).
 */
export async function disconnectTelegram(): Promise<{
  enabled: boolean
  status: ConnectionStatus
}> {
  await stopTelegramChannel()

  // Clear settings
  updateSettingByPath('channels.telegram.enabled', false)
  updateSettingByPath('channels.telegram.botToken', '')

  return {
    enabled: false,
    status: 'disconnected',
  }
}

/**
 * Get Telegram connection status.
 */
export function getTelegramStatus(): {
  enabled: boolean
  status: ConnectionStatus
} {
  const settings = getSettings()
  const telegramConfig = settings.channels.telegram

  if (!telegramConfig.enabled) {
    return { enabled: false, status: 'disconnected' }
  }

  if (!telegramConfig.botToken) {
    return { enabled: true, status: 'credentials_required' }
  }

  const channel = activeChannels.get(TELEGRAM_CONNECTION_ID)

  return {
    enabled: true,
    status: channel?.getStatus() || 'disconnected',
  }
}

/**
 * Get Telegram configuration (token masked with ********).
 */
export function getTelegramConfig(): {
  enabled: boolean
  botToken: string
} | null {
  const settings = getSettings()
  const telegramConfig = settings.channels.telegram

  if (!telegramConfig.botToken) return null

  return {
    enabled: telegramConfig.enabled,
    botToken: telegramConfig.botToken ? '••••••••' : '',
  }
}
