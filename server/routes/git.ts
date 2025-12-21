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

// Generate diff content for an untracked file (shows all lines as additions)
function generateUntrackedFileDiff(basePath: string, filePath: string): string {
  const fullPath = path.join(basePath, filePath)
  const stat = fs.statSync(fullPath)

  if (stat.isDirectory()) {
    // Recursively get all files in directory
    const files = getAllFilesRecursive(fullPath, filePath)
    return files.map(f => generateUntrackedFileDiff(basePath, f)).join('\n')
  }

  // Check if file is binary
  const content = fs.readFileSync(fullPath)
  if (isBinaryContent(content)) {
    return `diff --git a/${filePath} b/${filePath}
new file mode 100644
--- /dev/null
+++ b/${filePath}
Binary file`
  }

  const textContent = content.toString('utf-8')
  const lines = textContent.split('\n')
  const lineCount = lines.length

  // Build diff header and content
  let diff = `diff --git a/${filePath} b/${filePath}
new file mode 100644
--- /dev/null
+++ b/${filePath}
@@ -0,0 +1,${lineCount} @@\n`

  diff += lines.map(line => `+${line}`).join('\n')

  return diff
}

// Get all files recursively from a directory
function getAllFilesRecursive(dirPath: string, relativePath: string): string[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const entryRelativePath = path.join(relativePath, entry.name)
    const entryFullPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      files.push(...getAllFilesRecursive(entryFullPath, entryRelativePath))
    } else {
      files.push(entryRelativePath)
    }
  }

  return files
}

// Simple binary detection: check for null bytes in first 8KB
function isBinaryContent(content: Buffer): boolean {
  const checkLength = Math.min(content.length, 8192)
  for (let i = 0; i < checkLength; i++) {
    if (content[i] === 0) return true
  }
  return false
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
  const includeUntracked = c.req.query('includeUntracked') === 'true'

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

    // Generate diff for untracked files if requested
    let untrackedDiff = ''
    if (includeUntracked) {
      const untrackedFiles = files.filter(f => f.status === 'untracked')
      const untrackedDiffs: string[] = []
      for (const file of untrackedFiles) {
        try {
          const fileDiff = generateUntrackedFileDiff(worktreePath, file.path)
          if (fileDiff) {
            untrackedDiffs.push(fileDiff)
          }
        } catch {
          // Skip files that can't be read
        }
      }
      untrackedDiff = untrackedDiffs.join('\n')
    }

    // Combine diffs
    let combinedDiff = diff || branchDiff
    if (untrackedDiff) {
      combinedDiff = combinedDiff ? `${combinedDiff}\n${untrackedDiff}` : untrackedDiff
    }

    return c.json({
      branch,
      diff: combinedDiff,
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

// POST /api/git/sync - Sync worktree with upstream (pull parent repo, then rebase worktree)
app.post('/sync', async (c) => {
  try {
    const body = await c.req.json<{
      repoPath: string
      worktreePath: string
      baseBranch?: string
    }>()

    const { repoPath, worktreePath, baseBranch } = body

    if (!repoPath || !worktreePath) {
      return c.json({ error: 'Missing required fields: repoPath, worktreePath' }, 400)
    }

    // Verify paths exist
    if (!fs.existsSync(repoPath)) {
      return c.json({ error: 'Repository path does not exist' }, 404)
    }
    if (!fs.existsSync(worktreePath)) {
      return c.json({ error: 'Worktree path does not exist' }, 404)
    }

    // Check for uncommitted changes in worktree
    try {
      const status = gitExec(worktreePath, 'status --porcelain')
      if (status.trim()) {
        return c.json({
          error: 'Uncommitted changes in worktree. Please commit or stash before syncing.',
          hasUncommittedChanges: true,
        }, 400)
      }
    } catch {
      // Continue if status check fails
    }

    // Detect default branch
    let defaultBranch = baseBranch || 'main'
    if (!baseBranch) {
      try {
        gitExec(repoPath, 'rev-parse --verify master')
        defaultBranch = 'master'
      } catch {
        defaultBranch = 'main'
      }
    }

    // Step 1: Pull on parent repo to update default branch
    let parentUpdated = false
    try {
      // Save current branch in parent repo
      const currentBranch = gitExec(repoPath, 'rev-parse --abbrev-ref HEAD')

      // Fetch and update default branch
      gitExec(repoPath, 'fetch origin')

      // If we're not on the default branch, checkout, pull, and go back
      if (currentBranch !== defaultBranch) {
        gitExec(repoPath, `checkout ${defaultBranch}`)
        gitExec(repoPath, 'pull')
        gitExec(repoPath, `checkout ${currentBranch}`)
      } else {
        gitExec(repoPath, 'pull')
      }
      parentUpdated = true
    } catch (err) {
      // Parent pull failed, but we can still try to rebase
      console.error('Failed to update parent repo:', err)
    }

    // Step 2: Rebase worktree on the updated default branch
    let worktreeRebased = false
    try {
      gitExec(worktreePath, `pull --rebase origin ${defaultBranch}`)
      worktreeRebased = true
    } catch (err) {
      // Check if it's a rebase conflict
      try {
        const rebaseStatus = gitExec(worktreePath, 'status')
        if (rebaseStatus.includes('rebase in progress')) {
          // Abort the rebase
          gitExec(worktreePath, 'rebase --abort')
          return c.json({
            error: 'Rebase conflict detected. Rebase has been aborted.',
            conflictAborted: true,
          }, 409)
        }
      } catch {
        // Ignore status check errors
      }

      return c.json({
        error: err instanceof Error ? err.message : 'Failed to rebase worktree',
      }, 500)
    }

    return c.json({
      success: true,
      parentUpdated,
      worktreeRebased,
      defaultBranch,
    })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to sync' }, 500)
  }
})

// POST /api/git/merge-to-main - Merge worktree branch into base branch
app.post('/merge-to-main', async (c) => {
  try {
    const body = await c.req.json<{
      repoPath: string
      worktreePath: string
      baseBranch?: string
    }>()

    const { repoPath, worktreePath, baseBranch } = body

    if (!repoPath || !worktreePath) {
      return c.json({ error: 'Missing required fields: repoPath, worktreePath' }, 400)
    }

    // Verify paths exist
    if (!fs.existsSync(repoPath)) {
      return c.json({ error: 'Repository path does not exist' }, 404)
    }
    if (!fs.existsSync(worktreePath)) {
      return c.json({ error: 'Worktree path does not exist' }, 404)
    }

    // Check for uncommitted changes in worktree
    try {
      const status = gitExec(worktreePath, 'status --porcelain')
      if (status.trim()) {
        return c.json({
          error: 'Uncommitted changes in worktree. Please commit or stash before merging.',
          hasUncommittedChanges: true,
        }, 400)
      }
    } catch {
      // Continue if status check fails
    }

    // Get the worktree branch name
    let worktreeBranch: string
    try {
      worktreeBranch = gitExec(worktreePath, 'rev-parse --abbrev-ref HEAD')
    } catch (err) {
      return c.json({
        error: 'Failed to determine worktree branch',
      }, 500)
    }

    // Detect default branch
    let defaultBranch = baseBranch || 'main'
    if (!baseBranch) {
      try {
        gitExec(repoPath, 'rev-parse --verify master')
        defaultBranch = 'master'
      } catch {
        defaultBranch = 'main'
      }
    }

    // Save current branch in parent repo
    let originalBranch: string
    try {
      originalBranch = gitExec(repoPath, 'rev-parse --abbrev-ref HEAD')
    } catch {
      originalBranch = defaultBranch
    }

    // Check for uncommitted changes in parent repo
    try {
      const parentStatus = gitExec(repoPath, 'status --porcelain')
      if (parentStatus.trim()) {
        return c.json({
          error: 'Uncommitted changes in parent repository. Please commit or stash before merging.',
          hasUncommittedChanges: true,
        }, 400)
      }
    } catch {
      // Continue if status check fails
    }

    try {
      // Fetch latest from origin
      gitExec(repoPath, 'fetch origin')

      // Checkout the base branch
      if (originalBranch !== defaultBranch) {
        gitExec(repoPath, `checkout ${defaultBranch}`)
      }

      // Pull latest changes
      try {
        gitExec(repoPath, 'pull')
      } catch {
        // Ignore pull errors, we'll try to merge anyway
      }

      // Attempt the merge
      try {
        gitExec(repoPath, `merge --no-ff ${worktreeBranch}`)
      } catch (mergeErr) {
        // Check if it's a merge conflict
        try {
          const mergeStatus = gitExec(repoPath, 'status')
          if (mergeStatus.includes('Unmerged paths') || mergeStatus.includes('fix conflicts')) {
            // Get list of conflicting files
            let conflictFiles: string[] = []
            try {
              const conflictOutput = gitExec(repoPath, 'diff --name-only --diff-filter=U')
              conflictFiles = conflictOutput.split('\n').filter(f => f.trim())
            } catch {
              // Ignore if we can't get conflict files
            }

            // Abort the merge
            gitExec(repoPath, 'merge --abort')

            // Restore original branch if needed
            if (originalBranch !== defaultBranch) {
              try {
                gitExec(repoPath, `checkout ${originalBranch}`)
              } catch {
                // Ignore checkout errors
              }
            }

            return c.json({
              error: 'Merge conflict detected. Merge has been aborted.',
              hasConflicts: true,
              conflictFiles,
            }, 409)
          }
        } catch {
          // Ignore status check errors
        }

        // Restore original branch if needed
        if (originalBranch !== defaultBranch) {
          try {
            gitExec(repoPath, `checkout ${originalBranch}`)
          } catch {
            // Ignore checkout errors
          }
        }

        return c.json({
          error: mergeErr instanceof Error ? mergeErr.message : 'Failed to merge',
        }, 500)
      }

      // Restore original branch if it was different
      if (originalBranch !== defaultBranch) {
        try {
          gitExec(repoPath, `checkout ${originalBranch}`)
        } catch {
          // Ignore checkout errors
        }
      }

      return c.json({
        success: true,
        baseBranch: defaultBranch,
        mergedBranch: worktreeBranch,
      })
    } catch (err) {
      // Restore original branch on any error
      if (originalBranch !== defaultBranch) {
        try {
          gitExec(repoPath, `checkout ${originalBranch}`)
        } catch {
          // Ignore checkout errors
        }
      }

      return c.json({
        error: err instanceof Error ? err.message : 'Failed to merge',
      }, 500)
    }
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to merge' }, 500)
  }
})

export default app
