import { Hono } from 'hono'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

interface DirectoryEntry {
  name: string
  type: 'file' | 'directory'
  isGitRepo: boolean
}

// Check if a directory is a git repository
function isGitRepo(dirPath: string): boolean {
  try {
    const gitDir = path.join(dirPath, '.git')
    return fs.existsSync(gitDir)
  } catch {
    return false
  }
}

const app = new Hono()

// GET /api/fs/list?path=/home/user
app.get('/list', (c) => {
  let dirPath = c.req.query('path') || os.homedir()

  // Expand ~ to home directory
  if (dirPath.startsWith('~')) {
    dirPath = path.join(os.homedir(), dirPath.slice(1))
  }

  // Resolve to absolute path
  dirPath = path.resolve(dirPath)

  try {
    if (!fs.existsSync(dirPath)) {
      return c.json({ error: 'Path does not exist' }, 404)
    }

    const stat = fs.statSync(dirPath)
    if (!stat.isDirectory()) {
      return c.json({ error: 'Path is not a directory' }, 400)
    }

    const entries: DirectoryEntry[] = []
    const items = fs.readdirSync(dirPath)

    for (const name of items) {
      // Skip hidden files/directories
      if (name.startsWith('.')) continue

      try {
        const itemPath = path.join(dirPath, name)
        const itemStat = fs.statSync(itemPath)

        if (itemStat.isDirectory()) {
          entries.push({
            name,
            type: 'directory',
            isGitRepo: isGitRepo(itemPath),
          })
        } else if (itemStat.isFile()) {
          entries.push({
            name,
            type: 'file',
            isGitRepo: false,
          })
        }
      } catch {
        // Skip items we can't access
      }
    }

    // Sort: directories first (git repos at top), then files
    entries.sort((a, b) => {
      if (a.type === 'directory' && b.type === 'file') return -1
      if (a.type === 'file' && b.type === 'directory') return 1
      if (a.type === 'directory' && b.type === 'directory') {
        if (a.isGitRepo && !b.isGitRepo) return -1
        if (!a.isGitRepo && b.isGitRepo) return 1
      }
      return a.name.localeCompare(b.name)
    })

    return c.json({
      path: dirPath,
      parent: path.dirname(dirPath),
      entries,
    })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to list directory' }, 500)
  }
})

export default app
