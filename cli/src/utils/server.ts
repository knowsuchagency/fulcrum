import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

interface Settings {
  port?: number
}

function readSettingsFile(path: string): Settings | null {
  try {
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8')
      return JSON.parse(content)
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

/**
 * Discovers the Vibora server URL.
 * Priority:
 * 1. Explicit URL override (--url flag)
 * 2. Explicit port override (--port flag)
 * 3. VIBORA_URL environment variable
 * 4. .vibora/settings.json in CWD (read port)
 * 5. ~/.vibora/settings.json (read port)
 * 6. Default: http://localhost:3333
 */
export function discoverServerUrl(urlOverride?: string, portOverride?: string): string {
  // 1. Explicit URL override
  if (urlOverride) {
    return urlOverride
  }

  // 2. Explicit port override
  if (portOverride) {
    return `http://localhost:${portOverride}`
  }

  // 3. Environment variable
  if (process.env.VIBORA_URL) {
    return process.env.VIBORA_URL
  }

  // 4. Local .vibora/settings.json
  const cwdSettings = join(process.cwd(), '.vibora', 'settings.json')
  const localSettings = readSettingsFile(cwdSettings)
  if (localSettings?.port) {
    return `http://localhost:${localSettings.port}`
  }

  // 5. Global ~/.vibora/settings.json
  const globalSettings = join(homedir(), '.vibora', 'settings.json')
  const homeSettings = readSettingsFile(globalSettings)
  if (homeSettings?.port) {
    return `http://localhost:${homeSettings.port}`
  }

  // 6. Default
  return 'http://localhost:3333'
}

/**
 * Gets the .vibora directory path.
 * Checks CWD first, falls back to home directory.
 */
export function getViboraDir(): string {
  const cwdViboraDir = join(process.cwd(), '.vibora')
  if (existsSync(cwdViboraDir)) {
    return cwdViboraDir
  }
  return join(homedir(), '.vibora')
}
