import { defineCommand } from 'citty'
import { FulcrumClient } from '../client'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import { globalArgs, toFlags, setupJsonOutput } from './shared'

async function handleDevCommand(
  action: string | undefined,
  flags: Record<string, string>
) {
  const client = new FulcrumClient(flags.url, flags.port)

  switch (action) {
    case 'restart': {
      // Check if developer mode is enabled first
      const devMode = await client.getDeveloperMode()
      if (!devMode.enabled) {
        throw new CliError(
          'DEVELOPER_MODE_REQUIRED',
          'Developer mode is not enabled. Set FULCRUM_DEVELOPER=1 environment variable.',
          ExitCodes.INVALID_STATE
        )
      }

      if (!isJsonOutput()) {
        console.log('Triggering restart (build + migrate + restart)...')
      }
      const result = await client.restartFulcrum()

      if (result.error) {
        throw new CliError('RESTART_FAILED', result.error, ExitCodes.OPERATION_FAILED)
      }

      if (isJsonOutput()) {
        output({ status: 'initiated', message: 'Restart initiated' })
      } else {
        console.log('Restart initiated. If build or migration fails, old instance keeps running.')
      }
      break
    }

    case 'status': {
      const devMode = await client.getDeveloperMode()
      if (isJsonOutput()) {
        output({ developerMode: devMode.enabled })
      } else {
        if (devMode.enabled) {
          console.log('Developer mode: enabled')
          console.log('  Use "fulcrum dev restart" to rebuild and restart.')
        } else {
          console.log('Developer mode: disabled')
          console.log('  Set FULCRUM_DEVELOPER=1 to enable.')
        }
      }
      break
    }

    default:
      throw new CliError(
        'UNKNOWN_ACTION',
        `Unknown dev action: ${action}. Use 'fulcrum dev restart' or 'fulcrum dev status'`,
        ExitCodes.INVALID_ARGS
      )
  }
}

// ============================================================================
// Command Definitions
// ============================================================================

const devRestartCommand = defineCommand({
  meta: { name: 'restart', description: 'Rebuild and restart Fulcrum server' },
  args: globalArgs,
  async run({ args }) {
    setupJsonOutput(args)
    await handleDevCommand('restart', toFlags(args))
  },
})

const devStatusCommand = defineCommand({
  meta: { name: 'status', description: 'Show developer mode status' },
  args: globalArgs,
  async run({ args }) {
    setupJsonOutput(args)
    await handleDevCommand('status', toFlags(args))
  },
})

export const devCommand = defineCommand({
  meta: { name: 'dev', description: 'Developer mode commands' },
  subCommands: {
    restart: devRestartCommand,
    status: devStatusCommand,
  },
})
