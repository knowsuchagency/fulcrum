import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

/**
 * A test git repository with helper methods.
 */
export interface TestGitRepo {
  /** Path to the repository */
  path: string
  /** The default branch name (main or master) */
  defaultBranch: string
  /** Cleanup function - removes the repository */
  cleanup: () => void

  /** Create a commit with optional files */
  commit: (message: string, files?: Record<string, string>) => string
  /** Create a new branch */
  createBranch: (name: string) => void
  /** Checkout a branch */
  checkout: (branch: string) => void
  /** Add a file to the working directory (does not stage) */
  addFile: (filePath: string, content: string) => void
  /** Stage a file */
  stage: (filePath: string) => void
  /** Get current branch name */
  getCurrentBranch: () => string
  /** Run a git command and return stdout */
  git: (args: string) => string
}

/**
 * Creates a real git repository for testing.
 * Includes an initial commit with a README.
 */
export function createTestGitRepo(): TestGitRepo {
  const path = mkdtempSync(join(tmpdir(), 'fulcrum-git-test-'))

  // Helper to run git commands
  const git = (args: string): string => {
    return execSync(`git ${args}`, {
      cwd: path,
      encoding: 'utf-8',
      env: {
        ...process.env,
        // Avoid GPG signing in tests
        GIT_COMMITTER_NAME: 'Fulcrum Test',
        GIT_COMMITTER_EMAIL: 'test@fulcrum.test',
        GIT_AUTHOR_NAME: 'Fulcrum Test',
        GIT_AUTHOR_EMAIL: 'test@fulcrum.test',
      },
    }).trim()
  }

  // Initialize repo with local config
  git('init')
  git('config user.email "test@fulcrum.test"')
  git('config user.name "Fulcrum Test"')
  git('config commit.gpgsign false')

  // Create initial commit
  writeFileSync(join(path, 'README.md'), '# Test Repository\n')
  git('add .')
  git('commit -m "Initial commit"')

  // Determine default branch name
  const defaultBranch = git('rev-parse --abbrev-ref HEAD')

  const addFile = (filePath: string, content: string): void => {
    const fullPath = join(path, filePath)
    const dir = dirname(fullPath)
    mkdirSync(dir, { recursive: true })
    writeFileSync(fullPath, content)
  }

  return {
    path,
    defaultBranch,
    git,

    cleanup: () => {
      try {
        // First, remove any worktrees
        try {
          const worktreeList = git('worktree list --porcelain')
          for (const line of worktreeList.split('\n')) {
            if (line.startsWith('worktree ') && !line.endsWith(path)) {
              const wtPath = line.slice(9)
              try {
                git(`worktree remove "${wtPath}" --force`)
              } catch {
                // Ignore errors removing worktrees
              }
            }
          }
        } catch {
          // Ignore if no worktrees
        }

        rmSync(path, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    },

    commit: (message: string, files?: Record<string, string>): string => {
      if (files) {
        for (const [filePath, content] of Object.entries(files)) {
          addFile(filePath, content)
        }
        git('add .')
      }
      git(`commit -m "${message}" --allow-empty`)
      return git('rev-parse HEAD')
    },

    createBranch: (name: string): void => {
      git(`checkout -b ${name}`)
    },

    checkout: (branch: string): void => {
      git(`checkout ${branch}`)
    },

    addFile,

    stage: (filePath: string): void => {
      git(`add "${filePath}"`)
    },

    getCurrentBranch: (): string => {
      return git('rev-parse --abbrev-ref HEAD')
    },
  }
}

/**
 * Creates a git worktree from a test repo.
 * Returns the worktree path and cleanup function.
 */
export function createTestWorktree(
  repo: TestGitRepo,
  branchName: string
): { path: string; cleanup: () => void } {
  const worktreePath = mkdtempSync(join(tmpdir(), 'fulcrum-wt-test-'))

  // Create new branch and worktree
  repo.git(`worktree add "${worktreePath}" -b ${branchName}`)

  return {
    path: worktreePath,
    cleanup: () => {
      try {
        repo.git(`worktree remove "${worktreePath}" --force`)
      } catch {
        // Try to remove directory directly if git command fails
        try {
          rmSync(worktreePath, { recursive: true, force: true })
        } catch {
          // Ignore
        }
      }
    },
  }
}
