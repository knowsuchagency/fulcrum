import { defineCommand } from 'citty'
import { output, isJsonOutput } from '../utils/output'
import { confirm } from '../utils/prompt'
import { needsViboraMigration, migrateFromVibora, getLegacyViboraDir, getFulcrumDir } from '../utils/server'
import { globalArgs, toFlags, setupJsonOutput } from './shared'

async function handleMigrateFromViboraCommand(flags: Record<string, string>) {
  const autoYes = flags.yes === 'true' || flags.y === 'true'

  if (!needsViboraMigration()) {
    if (isJsonOutput()) {
      output({ migrated: false, reason: 'no_migration_needed' })
    } else {
      console.error('No migration needed.')
      console.error(`  ~/.vibora does not exist or ~/.fulcrum already has data.`)
    }
    return
  }

  const viboraDir = getLegacyViboraDir()
  const fulcrumDir = getFulcrumDir()

  if (!isJsonOutput()) {
    console.error(`\nFound existing Vibora data at ${viboraDir}`)
    console.error('Fulcrum (formerly Vibora) now uses ~/.fulcrum for data storage.')
    console.error('')
    console.error('Your existing data can be copied to the new location.')
    console.error('This is non-destructive - your ~/.vibora directory will be left untouched.')
    console.error('')
  }

  const shouldMigrate = autoYes || (await confirm('Would you like to copy your data to ~/.fulcrum?'))

  if (!shouldMigrate) {
    if (isJsonOutput()) {
      output({ migrated: false, reason: 'user_declined' })
    } else {
      console.error('Migration skipped.')
      console.error('You can run this command again later to migrate.')
    }
    return
  }

  if (!isJsonOutput()) {
    console.error('Copying data from ~/.vibora to ~/.fulcrum...')
  }

  const success = migrateFromVibora()

  if (success) {
    if (isJsonOutput()) {
      output({ migrated: true, from: viboraDir, to: fulcrumDir })
    } else {
      console.error('Migration complete!')
      console.error(`  Data copied from ${viboraDir} to ${fulcrumDir}`)
      console.error('  Your original ~/.vibora directory has been preserved.')
    }
  } else {
    if (isJsonOutput()) {
      output({ migrated: false, reason: 'migration_failed' })
    } else {
      console.error('Migration failed.')
      console.error('You can manually copy files from ~/.vibora to ~/.fulcrum')
    }
    process.exitCode = 1
  }
}

// ============================================================================
// Command Definition
// ============================================================================

export const migrateFromViboraCommand = defineCommand({
  meta: { name: 'migrate-from-vibora', description: 'Migrate data from legacy ~/.vibora directory' },
  args: {
    ...globalArgs,
    yes: { type: 'boolean' as const, alias: 'y', description: 'Auto-answer yes to prompts' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleMigrateFromViboraCommand(toFlags(args))
  },
})
