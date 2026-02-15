import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { log } from '../logger'
import { getFulcrumDir, isTestMode } from './paths'

// --- Key Mapping: fnox key → settings.json dot-notation path ---

export const FNOX_SECRET_MAP: Record<string, string> = {
  FULCRUM_GITHUB_PAT: 'integrations.githubPat',
  FULCRUM_CLOUDFLARE_API_TOKEN: 'integrations.cloudflareApiToken',
  FULCRUM_CLOUDFLARE_ACCOUNT_ID: 'integrations.cloudflareAccountId',
  FULCRUM_GOOGLE_CLIENT_ID: 'integrations.googleClientId',
  FULCRUM_GOOGLE_CLIENT_SECRET: 'integrations.googleClientSecret',
  FULCRUM_EMAIL_IMAP_PASSWORD: 'channels.email.imap.password',
  FULCRUM_SLACK_BOT_TOKEN: 'channels.slack.botToken',
  FULCRUM_SLACK_APP_TOKEN: 'channels.slack.appToken',
  FULCRUM_DISCORD_BOT_TOKEN: 'channels.discord.botToken',
  FULCRUM_TELEGRAM_BOT_TOKEN: 'channels.telegram.botToken',
  FULCRUM_PUSHOVER_APP_TOKEN: 'notifications.pushover.appToken',
  FULCRUM_PUSHOVER_USER_KEY: 'notifications.pushover.userKey',
  FULCRUM_SLACK_WEBHOOK_URL: 'notifications.slack.webhookUrl',
  FULCRUM_DISCORD_WEBHOOK_URL: 'notifications.discord.webhookUrl',
  FULCRUM_ZAI_API_KEY: 'zai.apiKey',
}

// Reverse mapping: settings path → fnox key
const PATH_TO_FNOX_KEY: Record<string, string> = {}
for (const [fnoxKey, settingsPath] of Object.entries(FNOX_SECRET_MAP)) {
  PATH_TO_FNOX_KEY[settingsPath] = fnoxKey
}

// --- Paths ---

function getFnoxConfigPath(): string {
  return join(getFulcrumDir(), 'fnox.toml')
}

function getFnoxKeyPath(): string {
  return process.env.FNOX_AGE_KEY_FILE || join(getFulcrumDir(), 'age.txt')
}

// --- Availability ---

let _fnoxAvailable: boolean | null = null

export function isFnoxAvailable(): boolean {
  if (isTestMode()) return false
  if (_fnoxAvailable !== null) return _fnoxAvailable

  // Check env flag set by CLI (avoids shell alias detection issues)
  const hasCliFlag = process.env.FULCRUM_FNOX_INSTALLED === '1'

  // Check that config and key files exist
  const configExists = existsSync(getFnoxConfigPath())
  const keyExists = existsSync(getFnoxKeyPath())

  if (!hasCliFlag) {
    // Fallback: check if fnox binary is in PATH
    try {
      execSync('which fnox', { stdio: 'ignore' })
    } catch {
      _fnoxAvailable = false
      return false
    }
  }

  _fnoxAvailable = configExists && keyExists
  if (!_fnoxAvailable) {
    log.settings.debug('fnox not fully configured', { configExists, keyExists })
  }
  return _fnoxAvailable
}

// --- Core CLI Functions ---

function fnoxEnv(): Record<string, string | undefined> {
  return { ...process.env, FNOX_AGE_KEY_FILE: getFnoxKeyPath() }
}

function fnoxArgs(): string {
  return `-c "${getFnoxConfigPath()}"`
}

export function fnoxGet(key: string): string | null {
  try {
    const result = execSync(`fnox get ${key} ${fnoxArgs()} --if-missing ignore`, {
      env: fnoxEnv(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
    return result || null
  } catch {
    return null
  }
}

export function fnoxSet(key: string, value: string): void {
  // Use stdin to avoid exposing secrets in process args
  execSync(`fnox set ${key} ${fnoxArgs()}`, {
    env: fnoxEnv(),
    input: value,
    stdio: ['pipe', 'ignore', 'ignore'],
  })
}

export function fnoxRemove(key: string): void {
  try {
    execSync(`fnox remove ${key} ${fnoxArgs()} --if-missing ignore`, {
      env: fnoxEnv(),
      stdio: 'ignore',
    })
  } catch {
    // Ignore errors when removing non-existent keys
  }
}

// --- In-Memory Cache ---

const secretCache = new Map<string, string>()

export function initFnoxSecrets(): void {
  if (!isFnoxAvailable()) return

  let loaded = 0
  for (const fnoxKey of Object.keys(FNOX_SECRET_MAP)) {
    const value = fnoxGet(fnoxKey)
    if (value) {
      secretCache.set(fnoxKey, value)
      loaded++
    }
  }

  if (loaded > 0) {
    log.settings.info('Loaded fnox secrets', { count: loaded })
  }
}

/**
 * Get a secret by its settings.json path (e.g. "integrations.githubPat").
 * Returns the cached value or null.
 */
export function getFnoxSecret(settingsPath: string): string | null {
  if (!isFnoxAvailable()) return null
  const fnoxKey = PATH_TO_FNOX_KEY[settingsPath]
  if (!fnoxKey) return null
  return secretCache.get(fnoxKey) ?? null
}

/**
 * Set a secret by its settings.json path.
 * Updates both fnox storage and the in-memory cache.
 */
export function setFnoxSecret(settingsPath: string, value: string): void {
  if (!isFnoxAvailable()) return
  const fnoxKey = PATH_TO_FNOX_KEY[settingsPath]
  if (!fnoxKey) return
  fnoxSet(fnoxKey, value)
  secretCache.set(fnoxKey, value)
  log.settings.info('Secret stored in fnox', { path: settingsPath })
}

/**
 * Remove a secret by its settings.json path.
 * Removes from both fnox storage and the in-memory cache.
 */
export function removeFnoxSecret(settingsPath: string): void {
  if (!isFnoxAvailable()) return
  const fnoxKey = PATH_TO_FNOX_KEY[settingsPath]
  if (!fnoxKey) return
  fnoxRemove(fnoxKey)
  secretCache.delete(fnoxKey)
  log.settings.info('Secret removed from fnox', { path: settingsPath })
}

/**
 * Check if a settings path corresponds to a secret that should be stored in fnox.
 */
export function isSecretPath(settingsPath: string): boolean {
  return settingsPath in PATH_TO_FNOX_KEY
}

/**
 * Get the count of secrets currently stored in fnox.
 */
export function getFnoxSecretCount(): number {
  return secretCache.size
}
