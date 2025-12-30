import { ViboraClient } from '../client'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'

export async function handleConfigCommand(
  action: string | undefined,
  positional: string[],
  flags: Record<string, string>
) {
  const client = new ViboraClient(flags.url, flags.port)

  switch (action) {
    case 'list': {
      const config = await client.getAllConfig()
      if (isJsonOutput()) {
        output(config)
      } else {
        console.log('Configuration:')
        for (const [key, value] of Object.entries(config)) {
          const displayValue = value === null ? '(not set)' : value
          console.log(`  ${key}: ${displayValue}`)
        }
      }
      break
    }

    case 'get': {
      const [key] = positional
      if (!key) {
        throw new CliError('MISSING_KEY', 'Config key is required', ExitCodes.INVALID_ARGS)
      }
      const config = await client.getConfig(key)
      if (isJsonOutput()) {
        output(config)
      } else {
        const value = config.value === null ? '(not set)' : config.value
        console.log(`${key}: ${value}`)
      }
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
      if (isJsonOutput()) {
        output(config)
      } else {
        console.log(`Set ${key} = ${config.value}`)
      }
      break
    }

    case 'reset': {
      const [key] = positional
      if (!key) {
        throw new CliError('MISSING_KEY', 'Config key is required', ExitCodes.INVALID_ARGS)
      }
      const config = await client.resetConfig(key)
      if (isJsonOutput()) {
        output(config)
      } else {
        console.log(`Reset ${key} to default: ${config.value}`)
      }
      break
    }

    default:
      throw new CliError(
        'UNKNOWN_ACTION',
        `Unknown action: ${action}. Valid: list, get, set, reset`,
        ExitCodes.INVALID_ARGS
      )
  }
}
