/**
 * Expand tilde in path to home directory
 */
export function expandTildePath(path: string, homeDir: string): string {
  if (!path) return path
  if (path === '~') return homeDir
  if (path.startsWith('~/')) return homeDir + path.slice(1)
  return path
}
