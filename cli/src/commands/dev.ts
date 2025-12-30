import { ViboraClient } from '../client'
import { output, isJsonOutput } from '../utils/output'
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

      if (!isJsonOutput()) {
        console.log('Triggering restart (build + migrate + restart)...')
      }
      const result = await client.restartVibora()

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
          console.log('  Use "vibora dev restart" to rebuild and restart.')
        } else {
          console.log('Developer mode: disabled')
          console.log('  Set VIBORA_DEVELOPER=1 to enable.')
        }
      }
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
