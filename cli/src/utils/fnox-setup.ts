import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { CliError, ExitCodes } from './errors'

/**
 * Ensure fnox is set up in the given Fulcrum directory.
 *
 * 1. Generate age key if it doesn't exist
 * 2. Create fnox.toml with age provider if it doesn't exist
 * 3. Verify the setup works with a round-trip test
 */
export function ensureFnoxSetup(fulcrumDir: string): void {
  const ageKeyPath = join(fulcrumDir, 'age.txt')
  const fnoxConfigPath = join(fulcrumDir, 'fnox.toml')

  // Step 1: Generate age key if needed
  let publicKey: string
  if (!existsSync(ageKeyPath)) {
    console.error('Generating age encryption key...')
    try {
      const output = execSync(`age-keygen -o "${ageKeyPath}" 2>&1`, { encoding: 'utf-8' })
      // age-keygen outputs "Public key: age1..." to stderr (captured via 2>&1)
      const match = output.match(/Public key: (age1\S+)/)
      if (!match) {
        throw new Error(`Could not parse public key from age-keygen output: ${output}`)
      }
      publicKey = match[1]
    } catch (err) {
      throw new CliError(
        'FNOX_SETUP_FAILED',
        `Failed to generate age key: ${err instanceof Error ? err.message : String(err)}`,
        ExitCodes.ERROR
      )
    }
    // Ensure restrictive permissions
    chmodSync(ageKeyPath, 0o600)
    console.error('Age encryption key generated.')
  } else {
    // Read existing public key from age.txt
    const content = readFileSync(ageKeyPath, 'utf-8')
    const match = content.match(/# public key: (age1\S+)/)
    if (!match) {
      throw new CliError(
        'FNOX_SETUP_FAILED',
        `Could not parse public key from existing ${ageKeyPath}`,
        ExitCodes.ERROR
      )
    }
    publicKey = match[1]
  }

  // Step 2: Create fnox.toml if needed, or ensure plain provider exists
  if (!existsSync(fnoxConfigPath)) {
    console.error('Creating fnox configuration...')
    const config = `[providers.plain]\ntype = "plain"\n\n[providers.age]\ntype = "age"\nrecipients = ["${publicKey}"]\n`
    writeFileSync(fnoxConfigPath, config, 'utf-8')
    console.error('fnox configuration created.')
  } else {
    // Ensure plain provider exists in existing config (upgrade from age-only)
    const existingConfig = readFileSync(fnoxConfigPath, 'utf-8')
    if (!existingConfig.includes('[providers.plain]')) {
      const updatedConfig = `[providers.plain]\ntype = "plain"\n\n${existingConfig}`
      writeFileSync(fnoxConfigPath, updatedConfig, 'utf-8')
      console.error('Added plain provider to fnox configuration.')
    }
  }

  // Step 3: Verify with a round-trip test
  const env = { ...process.env, FNOX_AGE_KEY_FILE: ageKeyPath }
  const fnoxArgs = `-c "${fnoxConfigPath}"`
  try {
    execSync(`fnox set FULCRUM_SETUP_TEST test_value ${fnoxArgs}`, { env, stdio: 'ignore' })
    const value = execSync(`fnox get FULCRUM_SETUP_TEST ${fnoxArgs}`, { env, encoding: 'utf-8' }).trim()
    execSync(`fnox remove FULCRUM_SETUP_TEST ${fnoxArgs}`, { env, stdio: 'ignore' })
    if (value !== 'test_value') {
      throw new Error(`Round-trip test failed: expected "test_value", got "${value}"`)
    }
  } catch (err) {
    throw new CliError(
      'FNOX_SETUP_FAILED',
      `fnox verification failed: ${err instanceof Error ? err.message : String(err)}\n` +
        `  Age key: ${ageKeyPath}\n` +
        `  Config: ${fnoxConfigPath}\n` +
        `  Ensure fnox and age are properly installed.`,
      ExitCodes.ERROR
    )
  }
}
