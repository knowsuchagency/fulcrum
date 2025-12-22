import * as readline from 'node:readline'

/**
 * Prompts the user for confirmation with a yes/no question.
 * Uses stderr for output to keep stdout clean for JSON.
 * Default is "no" - user must explicitly type "y" or "yes".
 */
export async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  })

  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
    })
  })
}
