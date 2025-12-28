/**
 * Check if a string looks like a git URL
 */
export function isGitUrl(source: string): boolean {
  return (
    source.startsWith('git@') ||
    source.startsWith('https://') ||
    source.startsWith('http://') ||
    source.startsWith('gh:') ||
    source.startsWith('gl:') ||
    source.startsWith('bb:')
  )
}

/**
 * Extract repository name from a git URL
 *
 * Examples:
 * - https://github.com/user/repo.git -> repo
 * - https://github.com/user/repo -> repo
 * - git@github.com:user/repo.git -> repo
 * - gh:user/repo -> repo
 */
export function extractRepoNameFromUrl(url: string): string {
  // Remove .git suffix if present
  const cleaned = url.replace(/\.git$/, '')

  // Handle different URL formats
  if (cleaned.startsWith('git@')) {
    // git@github.com:user/repo -> repo
    const match = cleaned.match(/:([^/]+\/)?([^/]+)$/)
    if (match) return match[2]
  } else if (cleaned.startsWith('gh:') || cleaned.startsWith('gl:') || cleaned.startsWith('bb:')) {
    // gh:user/repo -> repo
    const parts = cleaned.split('/')
    if (parts.length > 0) return parts[parts.length - 1]
  } else {
    // https://github.com/user/repo -> repo
    const parts = cleaned.split('/')
    if (parts.length > 0) return parts[parts.length - 1]
  }

  // Fallback: use the whole URL as name (shouldn't happen)
  return cleaned
}
