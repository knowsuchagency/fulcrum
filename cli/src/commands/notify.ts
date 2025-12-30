import { ViboraClient } from '../client'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'

export async function handleNotifyCommand(
  positional: string[],
  flags: Record<string, string>
) {
  const client = new ViboraClient(flags.url, flags.port)

  const title = flags.title || positional[0]
  const message = flags.message || positional.slice(1).join(' ') || positional[0]

  if (!title) {
    throw new CliError(
      'MISSING_TITLE',
      'Title is required. Usage: vibora notify <title> [message] or --title=<title> --message=<message>',
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
