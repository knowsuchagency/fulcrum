import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdirSync, rmSync } from 'fs'
import { execSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { BranchInfo } from '../../shared/types'

// Helper to create a test git repository
function createTestRepo(repoName: string): string {
  const repoPath = join(tmpdir(), `fulcrum-test-${repoName}-${Date.now()}`)
  mkdirSync(repoPath, { recursive: true })

  // Initialize git repo
  execSync('git init', { cwd: repoPath })
  execSync('git config user.email "test@example.com"', { cwd: repoPath })
  execSync('git config user.name "Test User"', { cwd: repoPath })

  // Create initial commit
  execSync('echo "test" > README.md', { cwd: repoPath })
  execSync('git add .', { cwd: repoPath })
  execSync('git commit -m "Initial commit"', { cwd: repoPath })

  return repoPath
}

// Helper to cleanup test repo
function cleanupTestRepo(repoPath: string): void {
  try {
    rmSync(repoPath, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}

describe('Git Branches API', () => {
  let testRepoPath: string

  beforeAll(() => {
    testRepoPath = createTestRepo('branches-api')

    // Rename to main for consistency
    execSync('git branch -M main', { cwd: testRepoPath })

    // Create some local branches
    execSync('git checkout -b feature-1', { cwd: testRepoPath })
    execSync('git checkout -b feature-2', { cwd: testRepoPath })
    execSync('git checkout main', { cwd: testRepoPath })
  })

  afterAll(() => {
    cleanupTestRepo(testRepoPath)
  })

  describe('Local branches only', () => {
    test('lists only local branches when includeRemote is false', () => {
      const branchOutput = execSync('git branch --list', {
        cwd: testRepoPath,
        encoding: 'utf-8',
      })

      const branches = branchOutput
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => line.replace(/^\* /, ''))

      expect(branches).toContain('main')
      expect(branches).toContain('feature-1')
      expect(branches).toContain('feature-2')
      expect(branches.length).toBeGreaterThanOrEqual(3)
    })

    test('identifies current branch with * marker', () => {
      const branchOutput = execSync('git branch --list', {
        cwd: testRepoPath,
        encoding: 'utf-8',
      })

      const currentLine = branchOutput
        .split('\n')
        .find((line) => line.trim().startsWith('*'))

      expect(currentLine).toBeDefined()
      expect(currentLine).toContain('* main')
    })
  })

  describe('With remote branches', () => {
    let repoWithRemote: string

    beforeAll(() => {
      // Create another local repo to act as "remote"
      repoWithRemote = createTestRepo('with-remote')

      // Rename to main for consistency
      execSync('git branch -M main', { cwd: repoWithRemote })

      // Create a bare remote repository
      const bareRemotePath = join(tmpdir(), `fulcrum-test-remote-${Date.now()}`)
      mkdirSync(bareRemotePath, { recursive: true })
      execSync('git init --bare', { cwd: bareRemotePath })

      // Add remote
      execSync(`git remote add origin ${bareRemotePath}`, { cwd: repoWithRemote })

      // Push main to remote first
      execSync('git push -u origin main', { cwd: repoWithRemote })

      // Create a remote-tracking branch
      execSync('git checkout -b feature-remote', { cwd: repoWithRemote })
      execSync('echo "remote feature" > feature.txt', { cwd: repoWithRemote })
      execSync('git add .', { cwd: repoWithRemote })
      execSync('git commit -m "Add remote feature"', { cwd: repoWithRemote })

      // Push to remote
      execSync('git push -u origin feature-remote', { cwd: repoWithRemote })
      execSync('git checkout main', { cwd: repoWithRemote })

      // Fetch to update remote-tracking branches
      execSync('git fetch origin', { cwd: repoWithRemote })
    })

    test('lists all branches including remote with --all flag', () => {
      const branchOutput = execSync('git branch --list --all', {
        cwd: repoWithRemote,
        encoding: 'utf-8',
      })

      const lines = branchOutput
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.includes('->'))

      // Should have local branches
      expect(lines.some((line) => line.replace(/^\* /, '') === 'main')).toBe(true)
      expect(lines.some((line) => line.replace(/^\* /, '') === 'feature-remote')).toBe(true)

      // Should have remote branches
      expect(lines.some((line) => line.includes('origin/main'))).toBe(true)
      expect(lines.some((line) => line.includes('origin/feature-remote'))).toBe(true)
    })

    test('parses branch names correctly', () => {
      const branchOutput = execSync('git branch --list --all', {
        cwd: repoWithRemote,
        encoding: 'utf-8',
      })

      // Debug: log the raw output
      console.log('Raw branch output:', branchOutput)

      const branches: BranchInfo[] = branchOutput
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
          const isCurrent = line.startsWith('*')
          const branchName = line.replace(/^\* /, '').trim()

          if (branchName.includes(' -> ')) {
            return null
          }

          if (branchName.startsWith('remotes/')) {
            // Remote branch: remotes/origin/main -> origin/main
            const withoutRemotes = branchName.replace(/^remotes\//, '')
            const [remoteName, ...nameParts] = withoutRemotes.split('/')
            const shortName = nameParts.join('/')
            return {
              name: shortName,
              fullName: withoutRemotes,
              type: 'remote' as const,
              isCurrent: false,
              remoteName,
            }
          } else if (branchName.includes('/') && !branchName.startsWith('remotes/')) {
            // Edge case: branch name with slash but not remotes/ prefix
            return {
              name: branchName,
              fullName: branchName,
              type: 'local' as const,
              isCurrent,
              remoteName: undefined,
            }
          } else {
            return {
              name: branchName,
              fullName: branchName,
              type: 'local' as const,
              isCurrent,
              remoteName: undefined,
            }
          }
        })
        .filter((branch): branch is BranchInfo => branch !== null)

      // Check local branches
      const localBranches = branches.filter((b) => b.type === 'local')
      expect(localBranches.length).toBeGreaterThan(0)
      expect(localBranches.some((b) => b.name === 'main')).toBe(true)
      expect(localBranches.find((b) => b.name === 'main')?.isCurrent).toBe(true)
      expect(localBranches.some((b) => b.name === 'feature-remote')).toBe(true)

      // Check remote branches
      const remoteBranches = branches.filter((b) => b.type === 'remote')
      expect(remoteBranches.length).toBeGreaterThan(0)
      expect(remoteBranches.some((b) => b.remoteName === 'origin')).toBe(true)

      // Check that remote branches have correct structure (at least one should exist)
      const anyOriginBranch = remoteBranches.find((b) => b.remoteName === 'origin')
      expect(anyOriginBranch).toBeDefined()
      expect(anyOriginBranch?.remoteName).toBe('origin')
      expect(anyOriginBranch?.isCurrent).toBe(false)
      expect(anyOriginBranch?.type).toBe('remote')
    })
  })

  describe('Branch parsing edge cases', () => {
    test('handles symbolic refs like origin/HEAD', () => {
      const symbolicRef = 'origin/HEAD -> origin/main'

      const hasArrow = symbolicRef.includes(' -> ')
      expect(hasArrow).toBe(true)
    })

    test('handles branch names with slashes', () => {
      const branchLine = 'origin/feature/nested/path'

      const [remoteName, ...nameParts] = branchLine.split('/')
      const shortName = nameParts.join('/')

      expect(remoteName).toBe('origin')
      expect(shortName).toBe('feature/nested/path')
    })

    test('handles multiple remotes', () => {
      const branches = [
        'main',
        'origin/main',
        'upstream/main',
        'fork/feature-branch',
      ]

      const parsed = branches
        .filter((b) => !b.includes(' -> '))
        .map((branchName) => {
          if (branchName.includes('/')) {
            const [remoteName, ...nameParts] = branchName.split('/')
            const shortName = nameParts.join('/')
            return {
              name: shortName,
              fullName: branchName,
              type: 'remote' as const,
              isCurrent: false,
              remoteName,
            }
          } else {
            return {
              name: branchName,
              fullName: branchName,
              type: 'local' as const,
              isCurrent: false,
              remoteName: undefined,
            }
          }
        })

      expect(parsed[0]).toEqual({
        name: 'main',
        fullName: 'main',
        type: 'local',
        isCurrent: false,
        remoteName: undefined,
      })

      expect(parsed[1]).toEqual({
        name: 'main',
        fullName: 'origin/main',
        type: 'remote',
        isCurrent: false,
        remoteName: 'origin',
      })

      expect(parsed[2]).toEqual({
        name: 'main',
        fullName: 'upstream/main',
        type: 'remote',
        isCurrent: false,
        remoteName: 'upstream',
      })
    })
  })
})
