import { defineCommand } from 'citty'
import { FulcrumClient } from '../client'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import { globalArgs, toFlags, setupJsonOutput } from './shared'

export async function handleConfigCommand(
  action: string | undefined,
  positional: string[],
  flags: Record<string, string>
) {
  const client = new FulcrumClient(flags.url, flags.port)

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

// ============================================================================
// Command Definitions
// ============================================================================

const configListCommand = defineCommand({
  meta: { name: 'list', description: 'List all config values' },
  args: globalArgs,
  async run({ args }) {
    setupJsonOutput(args)
    await handleConfigCommand('list', [], toFlags(args))
  },
})

const configGetCommand = defineCommand({
  meta: { name: 'get', description: 'Get a config value' },
  args: {
    ...globalArgs,
    key: { type: 'positional' as const, description: 'Config key', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleConfigCommand('get', [args.key as string], toFlags(args))
  },
})

const configSetCommand = defineCommand({
  meta: { name: 'set', description: 'Set a config value' },
  args: {
    ...globalArgs,
    key: { type: 'positional' as const, description: 'Config key', required: true },
    value: { type: 'positional' as const, description: 'Config value', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleConfigCommand('set', [args.key as string, args.value as string], toFlags(args))
  },
})

const configResetCommand = defineCommand({
  meta: { name: 'reset', description: 'Reset a config value to default' },
  args: {
    ...globalArgs,
    key: { type: 'positional' as const, description: 'Config key', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleConfigCommand('reset', [args.key as string], toFlags(args))
  },
})

export const configCommand = defineCommand({
  meta: { name: 'config', description: 'Manage configuration' },
  subCommands: {
    list: configListCommand,
    get: configGetCommand,
    set: configSetCommand,
    reset: configResetCommand,
  },
})
