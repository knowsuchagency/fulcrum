import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CliError, ExitCodes } from '../utils/errors'
// @ts-expect-error - Bun text import
import PLUGIN_CODE from '../../../plugins/vibora-opencode/index.ts' with { type: 'text' }

export async function handleOpenCodeCommand(
  action: string | undefined,
  _rest: string[],
  _flags: Record<string, string>
) {
  if (action === 'install') {
    try {
      const pluginDir = join(homedir(), '.config', 'opencode', 'plugin')
      const pluginPath = join(pluginDir, 'vibora.ts')

      console.log('Installing OpenCode plugin...')
      mkdirSync(pluginDir, { recursive: true })
      writeFileSync(pluginPath, PLUGIN_CODE, 'utf-8')

      console.log('✓ Installed OpenCode plugin at ' + pluginPath)
      console.log('  The plugin will be loaded automatically when you restart OpenCode.')
    } catch (err) {
      throw new CliError(
        'INSTALL_FAILED',
        `Failed to install OpenCode plugin: ${err instanceof Error ? err.message : String(err)}`,
        ExitCodes.ERROR
      )
    }
    return
  }

  throw new CliError(
    'INVALID_ACTION',
    'Unknown action. usage: vibora opencode install',
    ExitCodes.INVALID_ARGS
  )
}
