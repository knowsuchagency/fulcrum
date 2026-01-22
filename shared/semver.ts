/**
 * Semantic versioning utilities for comparing version strings.
 * Used by both CLI and server for update checks.
 */

export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  preRelease: Array<string | number>
}

/**
 * Parse a semantic version string into its components.
 * Handles versions like "1.2.3", "v1.2.3", "1.2.3-beta.1", "1.2.3+build"
 */
export function parseSemver(version: string): ParsedVersion | null {
  const cleaned = version.trim().replace(/^v/, '')
  if (cleaned.length === 0) return null

  const [mainAndPre] = cleaned.split('+', 1)
  const [main, preReleaseRaw] = mainAndPre.split('-', 2)
  const parts = main.split('.')
  if (parts.length > 3 || parts.length === 0) return null

  // Reject leading zeros (except for "0" itself)
  if (parts.some((part) => part.length > 1 && part.startsWith('0'))) return null

  const major = Number(parts[0])
  const minor = Number(parts[1] ?? '0')
  const patch = Number(parts[2] ?? '0')
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return null
  if (major < 0 || minor < 0 || patch < 0) return null

  // Validate pre-release identifiers
  if (preReleaseRaw) {
    const preReleaseParts = preReleaseRaw.split('.')
    if (preReleaseParts.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) {
      return null
    }
  }

  const preRelease = preReleaseRaw
    ? preReleaseRaw.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part))
    : []

  return { major, minor, patch, preRelease }
}

/**
 * Compare two pre-release identifiers.
 * Numbers sort before strings, numbers compare numerically, strings compare lexically.
 */
export function compareIdentifiers(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'number') return -1
  if (typeof b === 'number') return 1
  return a.localeCompare(b)
}

/**
 * Compare two semantic versions.
 * Returns: positive if v1 > v2, negative if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
  const parsed1 = parseSemver(v1)
  const parsed2 = parseSemver(v2)
  if (!parsed1 || !parsed2) return 0

  if (parsed1.major !== parsed2.major) return parsed1.major - parsed2.major
  if (parsed1.minor !== parsed2.minor) return parsed1.minor - parsed2.minor
  if (parsed1.patch !== parsed2.patch) return parsed1.patch - parsed2.patch

  const pre1 = parsed1.preRelease
  const pre2 = parsed2.preRelease

  // No pre-release = higher precedence than any pre-release
  if (pre1.length === 0 && pre2.length === 0) return 0
  if (pre1.length === 0) return 1
  if (pre2.length === 0) return -1

  // Compare pre-release identifiers one by one
  const maxLen = Math.max(pre1.length, pre2.length)
  for (let i = 0; i < maxLen; i++) {
    const id1 = pre1[i]
    const id2 = pre2[i]
    if (id1 === undefined) return -1
    if (id2 === undefined) return 1
    const diff = compareIdentifiers(id1, id2)
    if (diff !== 0) return diff
  }

  return 0
}
