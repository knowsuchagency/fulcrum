import { defineCommand } from 'citty'
import { FulcrumClient } from '../client'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import { globalArgs, toFlags, setupJsonOutput } from './shared'

export async function handleNotifyCommand(
  positional: string[],
  flags: Record<string, string>
) {
  const client = new FulcrumClient(flags.url, flags.port)

  const title = flags.title || positional[0]
  const message = flags.message || positional.slice(1).join(' ') || positional[0]

  if (!title) {
    throw new CliError(
      'MISSING_TITLE',
      'Title is required. Usage: fulcrum notify <title> [message] or --title=<title> --message=<message>',
      ExitCodes.INVALID_ARGS
    )
  }

  const result = await client.sendNotification(title, message || title)
  if (isJsonOutput()) {
    output(result)
  } else {
    const successCount = result.results.filter((r) => r.success).length
    const totalCount = result.results.length
    console.log(`Notification sent to ${successCount}/${totalCount} channels`)
  }
}

// ============================================================================
// Command Definition
// ============================================================================

export const notifyCommand = defineCommand({
  meta: { name: 'notify', description: 'Send a notification' },
  args: {
    ...globalArgs,
    title: { type: 'positional' as const, description: 'Notification title', required: true },
    message: { type: 'positional' as const, description: 'Notification message' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    const positional = [args.title as string]
    if (args.message) positional.push(args.message as string)
    await handleNotifyCommand(positional, toFlags(args))
  },
})
