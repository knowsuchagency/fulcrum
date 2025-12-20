import type { IncomingMessage, ServerResponse } from 'http'
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import * as os from 'os'

// Helper to send JSON response
function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

// Helper to send error
function error(res: ServerResponse, message: string, status = 400) {
  json(res, { error: message }, status)
}

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

// GET /api/fs/list?path=/home/user
export function listDirectory(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  let dirPath = url.searchParams.get('path') || os.homedir()

  // Expand ~ to home directory
  if (dirPath.startsWith('~')) {
    dirPath = path.join(os.homedir(), dirPath.slice(1))
  }

  // Resolve to absolute path
  dirPath = path.resolve(dirPath)

  try {
    if (!fs.existsSync(dirPath)) {
      return error(res, 'Path does not exist', 404)
    }

    const stat = fs.statSync(dirPath)
    if (!stat.isDirectory()) {
      return error(res, 'Path is not a directory', 400)
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

    json(res, {
      path: dirPath,
      parent: path.dirname(dirPath),
      entries,
    })
  } catch (err) {
    error(res, err instanceof Error ? err.message : 'Failed to list directory', 500)
  }
}

// GET /api/git/branches?repo=/path/to/repo
export function listBranches(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  let repoPath = url.searchParams.get('repo')

  if (!repoPath) {
    return error(res, 'repo parameter is required', 400)
  }

  // Expand ~ to home directory
  if (repoPath.startsWith('~')) {
    repoPath = path.join(os.homedir(), repoPath.slice(1))
  }

  repoPath = path.resolve(repoPath)

  try {
    if (!fs.existsSync(repoPath)) {
      return error(res, 'Repository path does not exist', 404)
    }

    if (!isGitRepo(repoPath)) {
      return error(res, 'Path is not a git repository', 400)
    }

    // Get all local branches
    const branchOutput = execSync('git branch --list', {
      cwd: repoPath,
      encoding: 'utf-8',
    })

    const branches = branchOutput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.replace(/^\* /, '')) // Remove current branch marker

    // Get current branch
    let current = 'main'
    try {
      current = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: repoPath,
        encoding: 'utf-8',
      }).trim()
    } catch {
      // Use first branch if HEAD is detached
      current = branches[0] || 'main'
    }

    json(res, {
      branches,
      current,
    })
  } catch (err) {
    error(res, err instanceof Error ? err.message : 'Failed to list branches', 500)
  }
}
