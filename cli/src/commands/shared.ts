import { setJsonOutput } from '../utils/output'

/**
 * Global args shared across all CLI commands
 */
export const globalArgs = {
  port: {
    type: 'string' as const,
    description: 'Server port (default: 7777)',
  },
  url: {
    type: 'string' as const,
    description: 'Override full server URL',
  },
  json: {
    type: 'boolean' as const,
    description: 'Output as JSON',
  },
  debug: {
    type: 'boolean' as const,
    description: 'Show detailed error stack traces',
  },
}

/**
 * Helper to extract flags from Citty args
 */
export function toFlags(args: Record<string, unknown>): Record<string, string> {
  const flags: Record<string, string> = {}
  for (const [key, value] of Object.entries(args)) {
    if (value !== undefined && value !== false) {
      flags[key] = String(value)
    }
  }
  return flags
}

/**
 * Setup JSON output mode if flag is set
 */
export function setupJsonOutput(args: { json?: boolean }) {
  if (args.json) setJsonOutput(true)
}
