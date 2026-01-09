/**
 * Escape a string for safe use in shell commands using ANSI-C quoting ($'...').
 * This handles all shell metacharacters including quotes, backticks, $, and newlines.
 */
export function escapeForShell(str: string): string {
  const escaped = str
    .replace(/\\/g, '\\\\') // backslashes first
    .replace(/'/g, "\\'") // single quotes
    .replace(/\n/g, '\\n') // newlines
    .replace(/\r/g, '\\r') // carriage returns
    .replace(/\t/g, '\\t') // tabs
  return `$'${escaped}'`
}

/**
 * Check if a string needs shell escaping.
 * Safe characters: alphanumeric, hyphen, underscore, period.
 */
export function needsShellEscaping(str: string): boolean {
  return !/^[a-zA-Z0-9_.-]+$/.test(str)
}

/**
 * Escape a string for shell only if it contains special characters.
 * Simple alphanumeric strings (with hyphens/underscores) pass through unchanged.
 */
export function escapeForShellIfNeeded(str: string): string {
  if (needsShellEscaping(str)) {
    return escapeForShell(str)
  }
  return str
}
