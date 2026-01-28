/**
 * Slack API - Functions for managing Slack channel configuration and state.
 * Configuration stored in settings.json under channels.slack.
 */

import { getSettings, updateSettingByPath } from '../../../lib/settings'
import {
  activeChannels,
  SLACK_CONNECTION_ID,
  startSlackChannel,
  stopSlackChannel,
} from '../channel-manager'
import type { ConnectionStatus } from '../types'

// Re-export connection ID for backward compatibility
export { SLACK_CONNECTION_ID } from '../channel-manager'

/**
 * Configure Slack with tokens and enable the channel.
 * Saves configuration to settings.json and starts the channel.
 */
export async function configureSlack(botToken: string, appToken: string): Promise<{
  enabled: boolean
  status: ConnectionStatus
}> {
  // Stop existing channel if running
  await stopSlackChannel()

  // Save to settings
  updateSettingByPath('channels.slack.enabled', true)
  updateSettingByPath('channels.slack.botToken', botToken)
  updateSettingByPath('channels.slack.appToken', appToken)

  // Start the channel
  await startSlackChannel()

  // Get the active channel reference after starting
  const channel = activeChannels.get(SLACK_CONNECTION_ID)

  return {
    enabled: true,
    status: channel?.getStatus() || 'connecting',
  }
}

/**
 * Enable Slack using existing credentials from settings.
 */
export async function enableSlack(): Promise<{
  enabled: boolean
  status: ConnectionStatus
  error?: string
}> {
  const settings = getSettings()
  const slackConfig = settings.channels.slack

  if (!slackConfig.botToken || !slackConfig.appToken) {
    return {
      enabled: false,
      status: 'credentials_required',
      error: 'Slack tokens not configured.',
    }
  }

  // Stop existing channel if running
  await stopSlackChannel()

  // Update settings to enable
  updateSettingByPath('channels.slack.enabled', true)

  // Start the channel
  await startSlackChannel()

  // Get the active channel reference after starting
  const channel = activeChannels.get(SLACK_CONNECTION_ID)

  return {
    enabled: true,
    status: channel?.getStatus() || 'connecting',
  }
}

/**
 * Disable Slack and stop the channel.
 */
export async function disableSlack(): Promise<{
  enabled: boolean
  status: ConnectionStatus
}> {
  await stopSlackChannel()

  // Update settings to disable
  updateSettingByPath('channels.slack.enabled', false)

  return {
    enabled: false,
    status: 'disconnected',
  }
}

/**
 * Disconnect Slack (clear credentials from settings).
 */
export async function disconnectSlack(): Promise<{
  enabled: boolean
  status: ConnectionStatus
}> {
  await stopSlackChannel()

  // Clear settings
  updateSettingByPath('channels.slack.enabled', false)
  updateSettingByPath('channels.slack.botToken', '')
  updateSettingByPath('channels.slack.appToken', '')

  return {
    enabled: false,
    status: 'disconnected',
  }
}

/**
 * Get Slack connection status.
 */
export function getSlackStatus(): {
  enabled: boolean
  status: ConnectionStatus
} {
  const settings = getSettings()
  const slackConfig = settings.channels.slack

  if (!slackConfig.enabled) {
    return { enabled: false, status: 'disconnected' }
  }

  if (!slackConfig.botToken || !slackConfig.appToken) {
    return { enabled: true, status: 'credentials_required' }
  }

  const channel = activeChannels.get(SLACK_CONNECTION_ID)

  return {
    enabled: true,
    status: channel?.getStatus() || 'disconnected',
  }
}

/**
 * Get Slack configuration (tokens masked with ********).
 */
export function getSlackConfig(): {
  enabled: boolean
  botToken: string
  appToken: string
} | null {
  const settings = getSettings()
  const slackConfig = settings.channels.slack

  if (!slackConfig.botToken) return null

  return {
    enabled: slackConfig.enabled,
    botToken: slackConfig.botToken ? '••••••••' : '',
    appToken: slackConfig.appToken ? '••••••••' : '',
  }
}
