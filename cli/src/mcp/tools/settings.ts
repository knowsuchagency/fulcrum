/**
 * Settings MCP tools
 */
import { z } from 'zod'
import type { ToolRegistrar } from './types'
import { formatSuccess, handleToolError } from '../utils'

// Sensitive setting paths that should be masked in responses
const SENSITIVE_SETTINGS = new Set([
  'integrations.githubPat',
  'integrations.cloudflareApiToken',
])

// Mask sensitive values in settings output
function maskSensitiveValue(key: string, value: unknown): unknown {
  if (SENSITIVE_SETTINGS.has(key) && typeof value === 'string' && value.length > 0) {
    return '********'
  }
  return value
}

export const registerSettingsTools: ToolRegistrar = (server, client) => {
  // list_settings
  server.tool(
    'list_settings',
    'List all Fulcrum settings with their current values. Sensitive values (API keys, tokens) are masked.',
    {},
    async () => {
      try {
        const allConfig = await client.getAllConfig()

        // Flatten nested settings and mask sensitive values
        const flattenSettings = (
          obj: Record<string, unknown>,
          prefix = ''
        ): Record<string, unknown> => {
          const result: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key
            if (key === '_schemaVersion') continue // Skip internal fields
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
              Object.assign(result, flattenSettings(value as Record<string, unknown>, fullKey))
            } else {
              result[fullKey] = maskSensitiveValue(fullKey, value)
            }
          }
          return result
        }

        const settings = flattenSettings(allConfig)
        return formatSuccess({
          settings,
          categories: [
            'server',
            'paths',
            'editor',
            'integrations',
            'agent',
            'tasks',
            'appearance',
            'assistant',
          ],
          hint: 'Use get_setting to get a specific setting, update_setting to change values',
        })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_setting
  server.tool(
    'get_setting',
    'Get the current value of a specific Fulcrum setting. Use dot notation for nested settings (e.g., "appearance.theme").',
    {
      key: z
        .string()
        .describe('Setting key in dot notation (e.g., "appearance.theme", "server.port")'),
    },
    async ({ key }) => {
      try {
        const result = await client.getConfig(key)
        const maskedValue = maskSensitiveValue(key, result.value)
        return formatSuccess({
          key: result.key,
          value: maskedValue,
          default: result.default,
          isDefault: JSON.stringify(result.value) === JSON.stringify(result.default),
        })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // update_setting
  server.tool(
    'update_setting',
    'Update a Fulcrum setting. Use dot notation for nested settings. Returns the new value after update.',
    {
      key: z
        .string()
        .describe('Setting key in dot notation (e.g., "appearance.theme", "server.port")'),
      value: z
        .union([z.string(), z.number(), z.boolean(), z.null()])
        .describe('New value for the setting'),
    },
    async ({ key, value }) => {
      try {
        const result = await client.setConfig(key, value as string | number)
        const maskedValue = maskSensitiveValue(key, result.value)
        return formatSuccess({
          key: result.key,
          value: maskedValue,
          previousValue: maskSensitiveValue(key, result.previousValue),
          message: `Setting "${key}" updated successfully`,
        })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // reset_setting
  server.tool(
    'reset_setting',
    'Reset a Fulcrum setting to its default value.',
    {
      key: z
        .string()
        .describe('Setting key in dot notation (e.g., "appearance.theme", "server.port")'),
    },
    async ({ key }) => {
      try {
        const result = await client.resetConfig(key)
        const maskedValue = maskSensitiveValue(key, result.value)
        return formatSuccess({
          key: result.key,
          value: maskedValue,
          message: `Setting "${key}" reset to default`,
        })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_notification_settings
  server.tool(
    'get_notification_settings',
    'Get the current notification settings including all channels (toast, desktop, sound, Slack, Discord, Pushover).',
    {},
    async () => {
      try {
        const settings = await client.getNotifications()
        // Mask webhook URLs and tokens
        const masked = {
          ...settings,
          slack: settings.slack
            ? {
                ...settings.slack,
                webhookUrl: settings.slack.webhookUrl ? '********' : undefined,
              }
            : settings.slack,
          discord: settings.discord
            ? {
                ...settings.discord,
                webhookUrl: settings.discord.webhookUrl ? '********' : undefined,
              }
            : settings.discord,
          pushover: settings.pushover
            ? {
                ...settings.pushover,
                appToken: settings.pushover.appToken ? '********' : undefined,
                userKey: settings.pushover.userKey ? '********' : undefined,
              }
            : settings.pushover,
        }
        return formatSuccess(masked)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // update_notification_settings
  server.tool(
    'update_notification_settings',
    'Update notification settings. Can enable/disable the global setting, individual channels, or configure channel-specific options.',
    {
      enabled: z.optional(z.boolean()).describe('Enable or disable all notifications globally'),
      toast: z
        .optional(
          z.object({
            enabled: z.boolean().describe('Enable or disable toast notifications'),
          })
        )
        .describe('Toast notification settings'),
      desktop: z
        .optional(
          z.object({
            enabled: z.boolean().describe('Enable or disable desktop notifications'),
          })
        )
        .describe('Desktop notification settings'),
      sound: z
        .optional(
          z.object({
            enabled: z.boolean().describe('Enable or disable sound notifications'),
            customSoundFile: z.optional(z.string()).describe('Path to custom sound file'),
          })
        )
        .describe('Sound notification settings'),
      slack: z
        .optional(
          z.object({
            enabled: z.boolean().describe('Enable or disable Slack notifications'),
            webhookUrl: z.optional(z.string()).describe('Slack webhook URL'),
          })
        )
        .describe('Slack notification settings'),
      discord: z
        .optional(
          z.object({
            enabled: z.boolean().describe('Enable or disable Discord notifications'),
            webhookUrl: z.optional(z.string()).describe('Discord webhook URL'),
          })
        )
        .describe('Discord notification settings'),
      pushover: z
        .optional(
          z.object({
            enabled: z.boolean().describe('Enable or disable Pushover notifications'),
            appToken: z.optional(z.string()).describe('Pushover app token'),
            userKey: z.optional(z.string()).describe('Pushover user key'),
          })
        )
        .describe('Pushover notification settings'),
    },
    async ({ enabled, toast, desktop, sound, slack, discord, pushover }) => {
      try {
        const updates: Record<string, unknown> = {}
        if (enabled !== undefined) updates.enabled = enabled
        if (toast !== undefined) updates.toast = toast
        if (desktop !== undefined) updates.desktop = desktop
        if (sound !== undefined) updates.sound = sound
        if (slack !== undefined) updates.slack = slack
        if (discord !== undefined) updates.discord = discord
        if (pushover !== undefined) updates.pushover = pushover

        const result = await client.updateNotifications(updates)
        return formatSuccess({
          ...result,
          message: 'Notification settings updated successfully',
        })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )
}
