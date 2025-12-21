import { ViboraClient } from '../client'
import { output } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'

export async function handleConfigCommand(
  action: string | undefined,
  positional: string[],
  flags: Record<string, string>
) {
  const client = new ViboraClient(flags.url, flags.port)

  switch (action) {
    case 'get': {
      const [key] = positional
      if (!key) {
        throw new CliError('MISSING_KEY', 'Config key is required', ExitCodes.INVALID_ARGS)
      }
      const config = await client.getConfig(key)
      output(config)
      break
    }

    case 'set': {
      const [key, value] = positional
      if (!key) {
        throw new CliError('MISSING_KEY', 'Config key is required', ExitCodes.INVALID_ARGS)
      }
      if (value === undefined) {
        throw new CliError('MISSING_VALUE', 'Config value is required', ExitCodes.INVALID_ARGS)
      }
      // Try to parse as number if it looks like one
      const parsedValue = /^\d+$/.test(value) ? parseInt(value, 10) : value
      const config = await client.setConfig(key, parsedValue)
      output(config)
      break
    }

    case 'reset': {
      const [key] = positional
      if (!key) {
        throw new CliError('MISSING_KEY', 'Config key is required', ExitCodes.INVALID_ARGS)
      }
      const config = await client.resetConfig(key)
      output(config)
      break
    }

    default:
      throw new CliError(
        'UNKNOWN_ACTION',
        `Unknown action: ${action}. Valid: get, set, reset`,
        ExitCodes.INVALID_ARGS
      )
  }
}
