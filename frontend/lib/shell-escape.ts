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
