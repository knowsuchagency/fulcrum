import { spawnSync, type SpawnSyncReturns } from 'child_process'

/**
 * Secure git command builder that prevents command injection attacks.
 *
 * Instead of using shell string interpolation which is vulnerable to injection,
 * this utility uses spawnSync with an array of arguments which is safe.
 *
 * @example
 * // Simple commands
 * gitCommand('/path/to/repo').status().run()
 * gitCommand('/path/to/repo').checkout('main').run()
 *
 * // Complex commands with multiple args
 * gitCommand('/path/to/repo')
 *   .worktree('add', '-b', branchName, worktreePath, baseBranch)
 *   .run()
 *
 * // Commands that might fail
 * const result = gitCommand('/path/to/repo').revParse('--verify', 'main').tryRun()
 * if (result.success) {
 *   console.log(result.output)
 * }
 */

export interface GitRunResult {
  success: boolean
  output: string
  error?: string
  exitCode: number | null
}

export class GitCommand {
  private cwd: string
  private args: string[] = ['git']
  private maxBuffer: number = 10 * 1024 * 1024 // 10MB for large diffs

  constructor(cwd: string) {
    this.cwd = cwd
  }

  /**
   * Add raw arguments to the command.
   * Use this for building complex commands.
   */
  arg(...args: string[]): this {
    this.args.push(...args)
    return this
  }

  /**
   * Set max buffer size for output (default 10MB).
   */
  buffer(size: number): this {
    this.maxBuffer = size
    return this
  }

  // Common git commands with type-safe arguments

  /** git status [args...] */
  status(...args: string[]): this {
    return this.arg('status', ...args)
  }

  /** git checkout <branch> [args...] */
  checkout(branch: string, ...args: string[]): this {
    return this.arg('checkout', branch, ...args)
  }

  /** git branch [args...] */
  branch(...args: string[]): this {
    return this.arg('branch', ...args)
  }

  /** git worktree <subcommand> [args...] */
  worktree(subcommand: string, ...args: string[]): this {
    return this.arg('worktree', subcommand, ...args)
  }

  /** git diff [args...] */
  diff(...args: string[]): this {
    return this.arg('diff', ...args)
  }

  /** git log [args...] */
  log(...args: string[]): this {
    return this.arg('log', ...args)
  }

  /** git merge [args...] */
  merge(...args: string[]): this {
    return this.arg('merge', ...args)
  }

  /** git rebase [args...] */
  rebase(...args: string[]): this {
    return this.arg('rebase', ...args)
  }

  /** git push [args...] */
  push(...args: string[]): this {
    return this.arg('push', ...args)
  }

  /** git pull [args...] */
  pull(...args: string[]): this {
    return this.arg('pull', ...args)
  }

  /** git fetch [args...] */
  fetch(...args: string[]): this {
    return this.arg('fetch', ...args)
  }

  /** git commit [args...] */
  commit(...args: string[]): this {
    return this.arg('commit', ...args)
  }

  /** git rev-parse [args...] */
  revParse(...args: string[]): this {
    return this.arg('rev-parse', ...args)
  }

  /** git rev-list [args...] */
  revList(...args: string[]): this {
    return this.arg('rev-list', ...args)
  }

  /** git symbolic-ref [args...] */
  symbolicRef(...args: string[]): this {
    return this.arg('symbolic-ref', ...args)
  }

  /** git merge-base [args...] */
  mergeBase(...args: string[]): this {
    return this.arg('merge-base', ...args)
  }

  /**
   * Run the command and return output.
   * Throws an error if the command fails.
   */
  run(): string {
    const result = this.spawnCommand()

    if (result.status !== 0) {
      const errorMessage = result.stderr?.toString().trim() || `Git command failed with code ${result.status}`
      throw new Error(errorMessage)
    }

    return result.stdout?.toString().trim() || ''
  }

  /**
   * Run the command and return a result object.
   * Does not throw - check result.success instead.
   */
  tryRun(): GitRunResult {
    const result = this.spawnCommand()

    if (result.status !== 0) {
      return {
        success: false,
        output: result.stdout?.toString().trim() || '',
        error: result.stderr?.toString().trim() || `Git command failed with code ${result.status}`,
        exitCode: result.status,
      }
    }

    return {
      success: true,
      output: result.stdout?.toString().trim() || '',
      exitCode: result.status,
    }
  }

  /**
   * Spawn the command using spawnSync (no shell).
   * This is the core method that provides security against command injection.
   */
  private spawnCommand(): SpawnSyncReturns<Buffer> {
    // Remove 'git' from args since we pass it as the command
    const [command, ...args] = this.args

    return spawnSync(command, args, {
      cwd: this.cwd,
      maxBuffer: this.maxBuffer,
      // No shell: true - this is critical for security
      // Arguments are passed directly to git, not through shell interpretation
    })
  }

  /**
   * Get the command that would be run (for debugging).
   */
  toString(): string {
    return this.args.join(' ')
  }
}

/**
 * Create a new git command builder for a repository.
 *
 * @param cwd - Working directory for the git command
 * @returns A GitCommand builder instance
 *
 * @example
 * // Get current branch
 * const branch = gitCommand('/path/to/repo')
 *   .revParse('--abbrev-ref', 'HEAD')
 *   .run()
 *
 * // Create worktree with user-provided branch name (safe!)
 * gitCommand(repoPath)
 *   .worktree('add', '-b', userBranchName, worktreePath, baseBranch)
 *   .run()
 */
export function gitCommand(cwd: string): GitCommand {
  return new GitCommand(cwd)
}

/**
 * Clone a git repository securely using spawnSync (no shell injection).
 *
 * @param url - The repository URL to clone
 * @param targetPath - The target directory path
 * @param options - Optional clone options
 * @returns Result object with success status and output
 *
 * @example
 * const result = gitClone('https://github.com/user/repo.git', '/path/to/clone')
 * if (!result.success) {
 *   console.error(result.error)
 * }
 */
export function gitClone(
  url: string,
  targetPath: string,
  options: { depth?: number; timeout?: number } = {}
): GitRunResult {
  const args = ['clone']

  if (options.depth) {
    args.push('--depth', String(options.depth))
  }

  args.push(url, targetPath)

  const result = spawnSync('git', args, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: options.timeout ?? 120000, // 2 minute default
  })

  if (result.status !== 0) {
    return {
      success: false,
      output: result.stdout?.toString().trim() || '',
      error: result.stderr?.toString().trim() || `Git clone failed with code ${result.status}`,
      exitCode: result.status,
    }
  }

  return {
    success: true,
    output: result.stdout?.toString().trim() || '',
    exitCode: result.status,
  }
}
