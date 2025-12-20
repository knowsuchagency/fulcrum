import { Hono } from 'hono'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Execute git command and return output
function gitExec(cwd: string, args: string): string {
  return execSync(`git ${args}`, {
    cwd,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024, // 10MB for large diffs
  }).trim()
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

// GET /api/git/branches?repo=/path/to/repo
app.get('/branches', (c) => {
  let repoPath = c.req.query('repo')

  if (!repoPath) {
    return c.json({ error: 'repo parameter is required' }, 400)
  }

  // Expand ~ to home directory
  if (repoPath.startsWith('~')) {
    repoPath = path.join(os.homedir(), repoPath.slice(1))
  }

  repoPath = path.resolve(repoPath)

  try {
    if (!fs.existsSync(repoPath)) {
      return c.json({ error: 'Repository path does not exist' }, 404)
    }

    if (!isGitRepo(repoPath)) {
      return c.json({ error: 'Path is not a git repository' }, 400)
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

    return c.json({
      branches,
      current,
    })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to list branches' }, 500)
  }
})

// POST /api/git/worktree - Create a new worktree
app.post('/worktree', async (c) => {
  try {
    const body = await c.req.json<{
      repoPath: string
      worktreePath: string
      branch: string
      baseBranch: string
    }>()

    const { repoPath, worktreePath, branch, baseBranch } = body

    if (!repoPath || !worktreePath || !branch || !baseBranch) {
      return c.json(
        { error: 'Missing required fields: repoPath, worktreePath, branch, baseBranch' },
        400
      )
    }

    // Verify repo exists
    if (!fs.existsSync(repoPath)) {
      return c.json({ error: 'Repository path does not exist' }, 404)
    }

    // Check if worktree already exists
    if (fs.existsSync(worktreePath)) {
      return c.json({ error: 'Worktree path already exists' }, 409)
    }

    // Ensure parent directory exists
    const worktreeParent = path.dirname(worktreePath)
    if (!fs.existsSync(worktreeParent)) {
      fs.mkdirSync(worktreeParent, { recursive: true })
    }

    // Create the worktree with a new branch based on baseBranch
    try {
      gitExec(repoPath, `worktree add -b "${branch}" "${worktreePath}" "${baseBranch}"`)
    } catch {
      // Branch might already exist, try without -b
      try {
        gitExec(repoPath, `worktree add "${worktreePath}" "${branch}"`)
      } catch (err2) {
        const message = err2 instanceof Error ? err2.message : 'Failed to create worktree'
        return c.json({ error: message }, 500)
      }
    }

    return c.json(
      {
        success: true,
        worktreePath,
        branch,
      },
      201
    )
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to create worktree' }, 500)
  }
})

// DELETE /api/git/worktree - Remove a worktree
app.delete('/worktree', async (c) => {
  try {
    const body = await c.req.json<{
      repoPath: string
      worktreePath: string
    }>()

    const { repoPath, worktreePath } = body

    if (!repoPath || !worktreePath) {
      return c.json({ error: 'Missing required fields: repoPath, worktreePath' }, 400)
    }

    // Verify repo exists
    if (!fs.existsSync(repoPath)) {
      return c.json({ error: 'Repository path does not exist' }, 404)
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

    return c.json({ success: true })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to delete worktree' }, 500)
  }
})

// GET /api/git/diff?path=/path/to/worktree - Get git diff for a worktree
app.get('/diff', (c) => {
  const worktreePath = c.req.query('path')
  const staged = c.req.query('staged') === 'true'
  const ignoreWhitespace = c.req.query('ignoreWhitespace') === 'true'

  if (!worktreePath) {
    return c.json({ error: 'path parameter is required' }, 400)
  }

  if (!fs.existsSync(worktreePath)) {
    return c.json({ error: 'Path does not exist' }, 404)
  }

  try {
    // Get the diff
    const wsFlag = ignoreWhitespace ? ' -w' : ''
    const diffArgs = staged ? `diff --cached${wsFlag}` : `diff${wsFlag}`
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

    // If no local changes, get diff against base branch (master/main)
    let branchDiff = ''
    if (!diff) {
      try {
        // Find the merge-base with master or main
        let baseBranch = 'master'
        try {
          gitExec(worktreePath, 'rev-parse --verify master')
        } catch {
          baseBranch = 'main'
        }
        const mergeBase = gitExec(worktreePath, `merge-base ${baseBranch} HEAD`)
        branchDiff = gitExec(worktreePath, `diff${wsFlag} ${mergeBase}..HEAD`)
      } catch {
        // No branch diff available
        branchDiff = ''
      }
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

    return c.json({
      branch,
      diff: diff || branchDiff,
      files,
      hasStagedChanges: files.some((f) => f.staged),
      hasUnstagedChanges: files.some((f) => !f.staged && f.status !== 'untracked'),
      isBranchDiff: !diff && !!branchDiff,
    })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to get diff' }, 500)
  }
})

// GET /api/git/status?path=/path/to/worktree - Get git status
app.get('/status', (c) => {
  const worktreePath = c.req.query('path')

  if (!worktreePath) {
    return c.json({ error: 'path parameter is required' }, 400)
  }

  if (!fs.existsSync(worktreePath)) {
    return c.json({ error: 'Path does not exist' }, 404)
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

    return c.json({
      branch,
      ahead,
      behind,
      files,
      clean: files.length === 0,
    })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to get status' }, 500)
  }
})

export default app
