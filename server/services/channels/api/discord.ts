/**
 * Discord API - Functions for managing Discord channel configuration and state.
 * Configuration stored in settings.json under channels.discord.
 */

import { getSettings, updateSettingByPath } from '../../../lib/settings'
import {
  activeChannels,
  DISCORD_CONNECTION_ID,
  startDiscordChannel,
  stopDiscordChannel,
} from '../channel-manager'
import type { ConnectionStatus } from '../types'

// Re-export connection ID for backward compatibility
export { DISCORD_CONNECTION_ID } from '../channel-manager'

/**
 * Configure Discord with a bot token and enable the channel.
 * Saves configuration to settings.json and starts the channel.
 */
export async function configureDiscord(botToken: string): Promise<{
  enabled: boolean
  status: ConnectionStatus
}> {
  // Stop existing channel if running
  await stopDiscordChannel()

  // Save to settings
  updateSettingByPath('channels.discord.enabled', true)
  updateSettingByPath('channels.discord.botToken', botToken)

  // Start the channel
  await startDiscordChannel()

  // Get the active channel reference after starting
  const channel = activeChannels.get(DISCORD_CONNECTION_ID)

  return {
    enabled: true,
    status: channel?.getStatus() || 'connecting',
  }
}

/**
 * Enable Discord using existing credentials from settings.
 */
export async function enableDiscord(): Promise<{
  enabled: boolean
  status: ConnectionStatus
  error?: string
}> {
  const settings = getSettings()
  const discordConfig = settings.channels.discord

  if (!discordConfig.botToken) {
    return {
      enabled: false,
      status: 'credentials_required',
      error: 'Discord bot token not configured.',
    }
  }

  // Stop existing channel if running
  await stopDiscordChannel()

  // Update settings to enable
  updateSettingByPath('channels.discord.enabled', true)

  // Start the channel
  await startDiscordChannel()

  // Get the active channel reference after starting
  const channel = activeChannels.get(DISCORD_CONNECTION_ID)

  return {
    enabled: true,
    status: channel?.getStatus() || 'connecting',
  }
}

/**
 * Disable Discord and stop the channel.
 */
export async function disableDiscord(): Promise<{
  enabled: boolean
  status: ConnectionStatus
}> {
  await stopDiscordChannel()

  // Update settings to disable
  updateSettingByPath('channels.discord.enabled', false)

  return {
    enabled: false,
    status: 'disconnected',
  }
}

/**
 * Disconnect Discord (clear credentials from settings).
 */
export async function disconnectDiscord(): Promise<{
  enabled: boolean
  status: ConnectionStatus
}> {
  await stopDiscordChannel()

  // Clear settings
  updateSettingByPath('channels.discord.enabled', false)
  updateSettingByPath('channels.discord.botToken', '')

  return {
    enabled: false,
    status: 'disconnected',
  }
}

/**
 * Get Discord connection status.
 */
export function getDiscordStatus(): {
  enabled: boolean
  status: ConnectionStatus
} {
  const settings = getSettings()
  const discordConfig = settings.channels.discord

  if (!discordConfig.enabled) {
    return { enabled: false, status: 'disconnected' }
  }

  if (!discordConfig.botToken) {
    return { enabled: true, status: 'credentials_required' }
  }

  const channel = activeChannels.get(DISCORD_CONNECTION_ID)

  return {
    enabled: true,
    status: channel?.getStatus() || 'disconnected',
  }
}

/**
 * Get Discord configuration (token masked with ********).
 */
export function getDiscordConfig(): {
  enabled: boolean
  botToken: string
} | null {
  const settings = getSettings()
  const discordConfig = settings.channels.discord

  if (!discordConfig.botToken) return null

  return {
    enabled: discordConfig.enabled,
    botToken: discordConfig.botToken ? '••••••••' : '',
  }
}
