import type { IncomingMessage, ServerResponse } from 'http'
import { execSync, exec } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

// Helper to send JSON response
function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

// Helper to send error
function error(res: ServerResponse, message: string, status = 400) {
  json(res, { error: message }, status)
}

// Helper to parse JSON body
async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

// Execute git command and return output
function gitExec(cwd: string, args: string): string {
  return execSync(`git ${args}`, {
    cwd,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024, // 10MB for large diffs
  }).trim()
}

// POST /api/git/worktree - Create a new worktree
export async function createWorktree(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await parseBody<{
      repoPath: string
      worktreePath: string
      branch: string
      baseBranch: string
    }>(req)

    const { repoPath, worktreePath, branch, baseBranch } = body

    if (!repoPath || !worktreePath || !branch || !baseBranch) {
      return error(res, 'Missing required fields: repoPath, worktreePath, branch, baseBranch')
    }

    // Verify repo exists
    if (!fs.existsSync(repoPath)) {
      return error(res, 'Repository path does not exist', 404)
    }

    // Check if worktree already exists
    if (fs.existsSync(worktreePath)) {
      return error(res, 'Worktree path already exists', 409)
    }

    // Ensure parent directory exists
    const worktreeParent = path.dirname(worktreePath)
    if (!fs.existsSync(worktreeParent)) {
      fs.mkdirSync(worktreeParent, { recursive: true })
    }

    // Create the worktree with a new branch based on baseBranch
    try {
      gitExec(repoPath, `worktree add -b "${branch}" "${worktreePath}" "${baseBranch}"`)
    } catch (err) {
      // Branch might already exist, try without -b
      try {
        gitExec(repoPath, `worktree add "${worktreePath}" "${branch}"`)
      } catch (err2) {
        const message = err2 instanceof Error ? err2.message : 'Failed to create worktree'
        return error(res, message, 500)
      }
    }

    json(res, {
      success: true,
      worktreePath,
      branch,
    }, 201)
  } catch (err) {
    error(res, err instanceof Error ? err.message : 'Failed to create worktree', 500)
  }
}

// DELETE /api/git/worktree - Remove a worktree
export async function deleteWorktree(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await parseBody<{
      repoPath: string
      worktreePath: string
    }>(req)

    const { repoPath, worktreePath } = body

    if (!repoPath || !worktreePath) {
      return error(res, 'Missing required fields: repoPath, worktreePath')
    }

    // Verify repo exists
    if (!fs.existsSync(repoPath)) {
      return error(res, 'Repository path does not exist', 404)
    }

    // Remove worktree if it exists
    if (fs.existsSync(worktreePath)) {
      try {
        // First try git worktree remove
        gitExec(repoPath, `worktree remove "${worktreePath}" --force`)
      } catch {
        // If that fails, manually remove and prune
        fs.rmSync(worktreePath, { recursive: true, force: true })
        try {
          gitExec(repoPath, 'worktree prune')
        } catch {
          // Ignore prune errors
        }
      }
    }

    json(res, { success: true })
  } catch (err) {
    error(res, err instanceof Error ? err.message : 'Failed to delete worktree', 500)
  }
}

// GET /api/git/diff?path=/path/to/worktree - Get git diff for a worktree
export function getDiff(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  const worktreePath = url.searchParams.get('path')
  const staged = url.searchParams.get('staged') === 'true'

  if (!worktreePath) {
    return error(res, 'path parameter is required')
  }

  if (!fs.existsSync(worktreePath)) {
    return error(res, 'Path does not exist', 404)
  }

  try {
    // Get the diff
    const diffArgs = staged ? 'diff --cached' : 'diff'
    let diff = ''
    try {
      diff = gitExec(worktreePath, diffArgs)
    } catch {
      // No diff available
      diff = ''
    }

    // Get status summary
    let status = ''
    try {
      status = gitExec(worktreePath, 'status --short')
    } catch {
      status = ''
    }

    // Get current branch
    let branch = ''
    try {
      branch = gitExec(worktreePath, 'rev-parse --abbrev-ref HEAD')
    } catch {
      branch = 'unknown'
    }

    // Parse status into structured data
    const files = status
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const statusCode = line.substring(0, 2)
        const filePath = line.substring(3)
        return {
          path: filePath,
          status: parseStatusCode(statusCode),
          staged: statusCode[0] !== ' ' && statusCode[0] !== '?',
        }
      })

    json(res, {
      branch,
      diff,
      files,
      hasStagedChanges: files.some((f) => f.staged),
      hasUnstagedChanges: files.some((f) => !f.staged && f.status !== 'untracked'),
    })
  } catch (err) {
    error(res, err instanceof Error ? err.message : 'Failed to get diff', 500)
  }
}

function parseStatusCode(code: string): string {
  const index = code[0]
  const workTree = code[1]

  if (code === '??') return 'untracked'
  if (code === '!!') return 'ignored'
  if (index === 'A' || workTree === 'A') return 'added'
  if (index === 'D' || workTree === 'D') return 'deleted'
  if (index === 'M' || workTree === 'M') return 'modified'
  if (index === 'R' || workTree === 'R') return 'renamed'
  if (index === 'C' || workTree === 'C') return 'copied'
  return 'unknown'
}

// GET /api/git/status?path=/path/to/worktree - Get git status
export function getStatus(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  const worktreePath = url.searchParams.get('path')

  if (!worktreePath) {
    return error(res, 'path parameter is required')
  }

  if (!fs.existsSync(worktreePath)) {
    return error(res, 'Path does not exist', 404)
  }

  try {
    // Get current branch
    let branch = ''
    try {
      branch = gitExec(worktreePath, 'rev-parse --abbrev-ref HEAD')
    } catch {
      branch = 'unknown'
    }

    // Get ahead/behind info
    let ahead = 0
    let behind = 0
    try {
      const tracking = gitExec(worktreePath, 'rev-parse --abbrev-ref @{upstream}')
      if (tracking) {
        const counts = gitExec(worktreePath, `rev-list --left-right --count ${branch}...${tracking}`)
        const [a, b] = counts.split('\t').map(Number)
        ahead = a || 0
        behind = b || 0
      }
    } catch {
      // No upstream tracking
    }

    // Get status
    let status = ''
    try {
      status = gitExec(worktreePath, 'status --short')
    } catch {
      status = ''
    }

    const files = status
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const statusCode = line.substring(0, 2)
        const filePath = line.substring(3)
        return {
          path: filePath,
          status: parseStatusCode(statusCode),
          staged: statusCode[0] !== ' ' && statusCode[0] !== '?',
        }
      })

    json(res, {
      branch,
      ahead,
      behind,
      files,
      clean: files.length === 0,
    })
  } catch (err) {
    error(res, err instanceof Error ? err.message : 'Failed to get status', 500)
  }
}
