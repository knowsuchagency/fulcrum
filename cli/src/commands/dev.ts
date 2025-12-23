import { ViboraClient } from '../client'
import { output } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'

export async function handleDevCommand(
  action: string | undefined,
  flags: Record<string, string>
) {
  const client = new ViboraClient(flags.url, flags.port)

  switch (action) {
    case 'restart': {
      // Check if developer mode is enabled first
      const devMode = await client.getDeveloperMode()
      if (!devMode.enabled) {
        throw new CliError(
          'DEVELOPER_MODE_REQUIRED',
          'Developer mode is not enabled. Set VIBORA_DEVELOPER=1 environment variable.',
          ExitCodes.INVALID_STATE
        )
      }

      output({ status: 'building', message: 'Building Vibora...' })
      const result = await client.restartVibora()

      if (result.error) {
        throw new CliError('BUILD_FAILED', result.error, ExitCodes.OPERATION_FAILED)
      }

      output({ status: 'restarting', message: result.message || 'Restart initiated' })
      break
    }

    case 'status': {
      const devMode = await client.getDeveloperMode()
      output({
        developerMode: devMode.enabled,
        message: devMode.enabled
          ? 'Developer mode is enabled. Use "vibora dev restart" to rebuild and restart.'
          : 'Developer mode is disabled. Set VIBORA_DEVELOPER=1 to enable.',
      })
      break
    }

    default:
      throw new CliError(
        'UNKNOWN_ACTION',
        `Unknown dev action: ${action}. Use 'vibora dev restart' or 'vibora dev status'`,
        ExitCodes.INVALID_ARGS
      )
  }
}
