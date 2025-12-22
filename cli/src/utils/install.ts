import { execSync, spawnSync } from 'node:child_process'

/**
 * Check if Homebrew is installed.
 */
export function isBrewInstalled(): boolean {
  try {
    execSync('which brew', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Check if Bun is installed.
 */
export function isBunInstalled(): boolean {
  try {
    execSync('which bun', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Check if dtach is installed.
 */
export function isDtachInstalled(): boolean {
  try {
    execSync('which dtach', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Install dtach using Homebrew (macOS) or apt (Linux).
 * Returns true if installation succeeded.
 */
export function installDtach(): boolean {
  const hasBrew = isBrewInstalled()
  const cmd = hasBrew ? 'brew install dtach' : 'sudo apt install -y dtach'

  console.error(`Running: ${cmd}`)
  const result = spawnSync(cmd, { shell: true, stdio: 'inherit' })
  return result.status === 0
}

/**
 * Install Bun using Homebrew (macOS) or curl script (Linux/other).
 * Returns true if installation succeeded.
 */
export function installBun(): boolean {
  const hasBrew = isBrewInstalled()
  const cmd = hasBrew
    ? 'brew install oven-sh/bun/bun'
    : 'curl -fsSL https://bun.sh/install | bash'

  console.error(`Running: ${cmd}`)
  const result = spawnSync(cmd, { shell: true, stdio: 'inherit' })
  return result.status === 0
}
