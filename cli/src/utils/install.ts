import {
  isCommandInstalled,
  getDependency,
  installDependency as installDep,
} from './dependencies'

/**
 * Check if Homebrew is installed.
 */
export function isBrewInstalled(): boolean {
  return isCommandInstalled('brew')
}

/**
 * Check if Bun is installed.
 */
export function isBunInstalled(): boolean {
  return isCommandInstalled('bun')
}

/**
 * Check if dtach is installed.
 */
export function isDtachInstalled(): boolean {
  return isCommandInstalled('dtach')
}

/**
 * Check if Claude Code CLI is installed.
 */
export function isClaudeInstalled(): boolean {
  return isCommandInstalled('claude')
}

/**
 * Check if uv is installed.
 */
export function isUvInstalled(): boolean {
  return isCommandInstalled('uv')
}

/**
 * Check if GitHub CLI is installed.
 */
export function isGhInstalled(): boolean {
  return isCommandInstalled('gh')
}

/**
 * Install dtach using Homebrew (macOS) or apt (Linux).
 * Returns true if installation succeeded.
 */
export function installDtach(): boolean {
  const dep = getDependency('dtach')
  if (!dep) return false
  return installDep(dep)
}

/**
 * Install Bun using Homebrew (macOS) or curl script (Linux/other).
 * Returns true if installation succeeded.
 */
export function installBun(): boolean {
  const dep = getDependency('bun')
  if (!dep) return false
  return installDep(dep)
}

/**
 * Check if OpenCode CLI is installed.
 */
export function isOpencodeInstalled(): boolean {
  return isCommandInstalled('opencode')
}

/**
 * Install Claude Code CLI.
 * Returns true if installation succeeded.
 */
export function installClaude(): boolean {
  const dep = getDependency('claude')
  if (!dep) return false
  return installDep(dep)
}

/**
 * Install OpenCode CLI.
 * Returns true if installation succeeded.
 */
export function installOpencode(): boolean {
  const dep = getDependency('opencode')
  if (!dep) return false
  return installDep(dep)
}

/**
 * Install uv using Homebrew (macOS) or curl script (Linux/other).
 * Returns true if installation succeeded.
 */
export function installUv(): boolean {
  const dep = getDependency('uv')
  if (!dep) return false
  return installDep(dep)
}

/**
 * Install GitHub CLI using Homebrew (macOS) or apt (Linux).
 * Returns true if installation succeeded.
 */
export function installGh(): boolean {
  const dep = getDependency('gh')
  if (!dep) return false
  return installDep(dep)
}
