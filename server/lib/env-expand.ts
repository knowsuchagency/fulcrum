/**
 * Utilities for handling shell-style environment variable syntax in compose files
 *
 * Docker Compose supports shell variable expansion like:
 * - ${VAR} - use variable value
 * - ${VAR:-default} - use default if VAR is unset or empty
 * - ${VAR-default} - use default if VAR is unset
 * - ${VAR:=default} - set and use default if VAR is unset or empty
 * - ${VAR=default} - set and use default if VAR is unset
 *
 * When Fulcrum parses compose files, it needs to extract values for things like
 * ports and volume paths before passing to Docker. This module provides utilities
 * to handle that expansion.
 */

/**
 * Expand shell-style environment variable syntax to extract values
 *
 * @param str - The string that may contain env var syntax
 * @param env - Optional environment variables to use for expansion
 * @returns The expanded value, or null if it contains an unresolvable variable
 *
 * @example
 * expandEnvVar('${PORT:-3000}') // returns '3000'
 * expandEnvVar('${PORT:-3000}', { PORT: '8080' }) // returns '8080'
 * expandEnvVar('${PORT}') // returns null (no default, no env)
 * expandEnvVar('8080') // returns '8080' (literal value)
 */
export function expandEnvVar(str: string, env?: Record<string, string>): string | null {
  // Check if it's a ${VAR} or ${VAR:-default} style reference
  // Regex breakdown:
  // - ^\$\{ - starts with ${
  // - ([A-Za-z_][A-Za-z0-9_]*) - variable name (group 1)
  // - (?:(:?[-=])(.+))? - optional: operator and default value
  //   - (:?[-=]) - operator: :-, -, :=, or = (group 2)
  //   - (.+) - default value (group 3)
  // - \}$ - ends with }
  const braceMatch = str.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-=])(.+))?\}$/)

  if (braceMatch) {
    const varName = braceMatch[1]
    const operator = braceMatch[2] // ':-', '-', ':=', '=' or undefined
    const defaultValue = braceMatch[3] // the default value after the operator

    // Check if variable is set in provided env
    if (env && varName in env) {
      const value = env[varName]
      // For :- and :=, also check if value is empty
      if (operator?.startsWith(':') && value === '') {
        return defaultValue ?? null
      }
      return value
    }

    // Variable not in env, use default if available
    if (defaultValue !== undefined) {
      return defaultValue
    }

    // No default and no env value
    return null
  }

  // Check if it's a $VAR style reference (no braces)
  const simpleMatch = str.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/)

  if (simpleMatch) {
    const varName = simpleMatch[1]
    if (env && varName in env) {
      return env[varName]
    }
    return null
  }

  // Not a variable reference, return as-is
  return str
}

/**
 * Split a string on a delimiter, but respect ${...} blocks
 * The delimiter inside ${...} should not be treated as a separator
 *
 * @param str - The string to split
 * @param delimiter - The delimiter character (default: ':')
 * @returns Array of parts
 *
 * @example
 * splitRespectingEnvVars('8080:3000') // returns ['8080', '3000']
 * splitRespectingEnvVars('${PORT:-8080}:${PORT:-8080}') // returns ['${PORT:-8080}', '${PORT:-8080}']
 * splitRespectingEnvVars('${HOST:-0.0.0.0}:8080:3000') // returns ['${HOST:-0.0.0.0}', '8080', '3000']
 */
export function splitRespectingEnvVars(str: string, delimiter = ':'): string[] {
  const parts: string[] = []
  let current = ''
  let braceDepth = 0

  for (let i = 0; i < str.length; i++) {
    const char = str[i]

    if (char === '{' && i > 0 && str[i - 1] === '$') {
      braceDepth++
      current += char
    } else if (char === '}' && braceDepth > 0) {
      braceDepth--
      current += char
    } else if (char === delimiter && braceDepth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }

  parts.push(current)
  return parts
}

/**
 * Expand all environment variables in a string
 * Handles multiple variables and mixed literal/variable content
 *
 * @param str - The string that may contain env var syntax
 * @param env - Optional environment variables to use for expansion
 * @returns The expanded string, or null if any variable is unresolvable
 *
 * @example
 * expandAllEnvVars('http://${HOST:-localhost}:${PORT:-3000}')
 * // returns 'http://localhost:3000'
 */
export function expandAllEnvVars(str: string, env?: Record<string, string>): string | null {
  // Pattern to match ${VAR}, ${VAR:-default}, etc.
  const envVarPattern = /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g

  let result = str
  let match: RegExpExecArray | null

  // Reset lastIndex for global regex
  envVarPattern.lastIndex = 0

  while ((match = envVarPattern.exec(str)) !== null) {
    const fullMatch = match[0]
    const expanded = expandEnvVar(fullMatch, env)

    if (expanded === null) {
      return null
    }

    result = result.replace(fullMatch, expanded)
  }

  return result
}
