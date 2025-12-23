import { ViboraClient } from '../client'
import { output } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'

const VALID_CHANNELS = ['sound', 'slack', 'discord', 'pushover'] as const
type NotificationChannel = (typeof VALID_CHANNELS)[number]

export async function handleNotificationsCommand(
  action: string | undefined,
  positional: string[],
  flags: Record<string, string>
) {
  const client = new ViboraClient(flags.url, flags.port)

  switch (action) {
    case 'status':
    case undefined: {
      // Get current notification settings
      const settings = await client.getNotifications()
      output(settings)
      break
    }

    case 'enable': {
      const updated = await client.updateNotifications({ enabled: true })
      output(updated)
      break
    }

    case 'disable': {
      const updated = await client.updateNotifications({ enabled: false })
      output(updated)
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
      output(result)
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
      output(updated)
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
