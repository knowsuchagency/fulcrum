import { defineCommand } from 'citty'
import { FulcrumClient } from '../client'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import { globalArgs, toFlags, setupJsonOutput } from './shared'

const VALID_CHANNELS = ['sound', 'slack', 'discord', 'pushover'] as const
type NotificationChannel = (typeof VALID_CHANNELS)[number]

export async function handleNotificationsCommand(
  action: string | undefined,
  positional: string[],
  flags: Record<string, string>
) {
  const client = new FulcrumClient(flags.url, flags.port)

  switch (action) {
    case 'status':
    case undefined: {
      // Get current notification settings
      const settings = await client.getNotifications()
      if (isJsonOutput()) {
        output(settings)
      } else {
        console.log(`Notifications: ${settings.enabled ? 'enabled' : 'disabled'}`)
        console.log(`\nChannels:`)
        if (settings.sound) {
          console.log(`  sound: ${settings.sound.enabled ? 'enabled' : 'disabled'}`)
        }
        if (settings.slack) {
          console.log(`  slack: ${settings.slack.enabled ? 'enabled' : 'disabled'}`)
        }
        if (settings.discord) {
          console.log(`  discord: ${settings.discord.enabled ? 'enabled' : 'disabled'}`)
        }
        if (settings.pushover) {
          console.log(`  pushover: ${settings.pushover.enabled ? 'enabled' : 'disabled'}`)
        }
      }
      break
    }

    case 'enable': {
      const updated = await client.updateNotifications({ enabled: true })
      if (isJsonOutput()) {
        output(updated)
      } else {
        console.log('Notifications enabled')
      }
      break
    }

    case 'disable': {
      const updated = await client.updateNotifications({ enabled: false })
      if (isJsonOutput()) {
        output(updated)
      } else {
        console.log('Notifications disabled')
      }
      break
    }

    case 'test': {
      const [channel] = positional
      if (!channel) {
        throw new CliError(
          'MISSING_CHANNEL',
          `Channel is required. Valid: ${VALID_CHANNELS.join(', ')}`,
          ExitCodes.INVALID_ARGS
        )
      }
      if (!VALID_CHANNELS.includes(channel as NotificationChannel)) {
        throw new CliError(
          'INVALID_CHANNEL',
          `Invalid channel: ${channel}. Valid: ${VALID_CHANNELS.join(', ')}`,
          ExitCodes.INVALID_ARGS
        )
      }
      const result = await client.testNotification(channel as NotificationChannel)
      if (isJsonOutput()) {
        output(result)
      } else {
        if (result.success) {
          console.log(`Test notification sent to ${channel}`)
        } else {
          console.log(`Failed to send test to ${channel}: ${result.error}`)
        }
      }
      break
    }

    case 'set': {
      const [channel, key, value] = positional
      if (!channel) {
        throw new CliError(
          'MISSING_CHANNEL',
          `Channel is required. Valid: ${VALID_CHANNELS.join(', ')}`,
          ExitCodes.INVALID_ARGS
        )
      }
      if (!VALID_CHANNELS.includes(channel as NotificationChannel)) {
        throw new CliError(
          'INVALID_CHANNEL',
          `Invalid channel: ${channel}. Valid: ${VALID_CHANNELS.join(', ')}`,
          ExitCodes.INVALID_ARGS
        )
      }
      if (!key) {
        throw new CliError('MISSING_KEY', 'Setting key is required', ExitCodes.INVALID_ARGS)
      }
      if (value === undefined) {
        throw new CliError('MISSING_VALUE', 'Setting value is required', ExitCodes.INVALID_ARGS)
      }

      // Build the update object for the specific channel
      const update = buildChannelUpdate(channel as NotificationChannel, key, value)
      const updated = await client.updateNotifications(update)
      if (isJsonOutput()) {
        output(updated)
      } else {
        console.log(`Set ${channel}.${key} = ${value}`)
      }
      break
    }

    default:
      throw new CliError(
        'UNKNOWN_ACTION',
        `Unknown action: ${action}. Valid: status, enable, disable, test, set`,
        ExitCodes.INVALID_ARGS
      )
  }
}

function buildChannelUpdate(
  channel: NotificationChannel,
  key: string,
  value: string
): Record<string, unknown> {
  // Handle boolean values
  const parsedValue = value === 'true' ? true : value === 'false' ? false : value

  const channelConfig: Record<string, unknown> = { [key]: parsedValue }

  return { [channel]: channelConfig }
}

// ============================================================================
// Command Definitions
// ============================================================================

const notificationsStatusCommand = defineCommand({
  meta: { name: 'status', description: 'Show notification settings' },
  args: globalArgs,
  async run({ args }) {
    setupJsonOutput(args)
    await handleNotificationsCommand('status', [], toFlags(args))
  },
})

const notificationsEnableCommand = defineCommand({
  meta: { name: 'enable', description: 'Enable notifications' },
  args: globalArgs,
  async run({ args }) {
    setupJsonOutput(args)
    await handleNotificationsCommand('enable', [], toFlags(args))
  },
})

const notificationsDisableCommand = defineCommand({
  meta: { name: 'disable', description: 'Disable notifications' },
  args: globalArgs,
  async run({ args }) {
    setupJsonOutput(args)
    await handleNotificationsCommand('disable', [], toFlags(args))
  },
})

const notificationsTestCommand = defineCommand({
  meta: { name: 'test', description: 'Test a notification channel' },
  args: {
    ...globalArgs,
    channel: { type: 'positional' as const, description: 'Channel to test (sound, slack, discord, pushover)', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleNotificationsCommand('test', [args.channel as string], toFlags(args))
  },
})

const notificationsSetCommand = defineCommand({
  meta: { name: 'set', description: 'Set a notification channel config' },
  args: {
    ...globalArgs,
    channel: { type: 'positional' as const, description: 'Channel (sound, slack, discord, pushover)', required: true },
    key: { type: 'positional' as const, description: 'Config key', required: true },
    value: { type: 'positional' as const, description: 'Config value', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleNotificationsCommand('set', [args.channel as string, args.key as string, args.value as string], toFlags(args))
  },
})

export const notificationsCommand = defineCommand({
  meta: { name: 'notifications', description: 'Manage notification settings' },
  args: globalArgs,
  subCommands: {
    status: notificationsStatusCommand,
    enable: notificationsEnableCommand,
    disable: notificationsDisableCommand,
    test: notificationsTestCommand,
    set: notificationsSetCommand,
  },
  async run({ args }) {
    // Default to status when no subcommand
    setupJsonOutput(args)
    await handleNotificationsCommand(undefined, [], toFlags(args))
  },
})
