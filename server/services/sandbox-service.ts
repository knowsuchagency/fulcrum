import { execSync, spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import net from 'net'
import { getSettings } from '../lib/settings'
import { log } from '../lib/logger'

const SANDBOX_REPO_NAME = 'sandbox'

// Track running dev servers by session ID
const devServers = new Map<string, { process: ChildProcess; port: number }>()

/**
 * Get the path to the sandbox repository
 */
export function getSandboxRepoPath(): string {
  const settings = getSettings()
  const fulcrumDir = settings.__fulcrumDir || path.join(process.env.HOME || '~', '.fulcrum')
  return path.join(fulcrumDir, SANDBOX_REPO_NAME)
}

/**
 * Get the path to the worktrees directory
 */
export function getWorktreesDir(): string {
  const settings = getSettings()
  const fulcrumDir = settings.__fulcrumDir || path.join(process.env.HOME || '~', '.fulcrum')
  return path.join(fulcrumDir, 'worktrees')
}

/**
 * Check if the sandbox repository exists and is initialized
 */
export function isSandboxInitialized(): boolean {
  const sandboxPath = getSandboxRepoPath()
  return fs.existsSync(path.join(sandboxPath, '.git'))
}

/**
 * Initialize the sandbox repository by copying from the template
 */
export function initializeSandbox(): void {
  const sandboxPath = getSandboxRepoPath()

  if (isSandboxInitialized()) {
    log.assistant.debug('Sandbox already initialized', { path: sandboxPath })
    return
  }

  log.assistant.info('Initializing sandbox repository', { path: sandboxPath })

  // Find the sandbox template in the Fulcrum installation
  const templatePath = findSandboxTemplate()
  if (!templatePath) {
    throw new Error('Sandbox template not found. Please reinstall Fulcrum.')
  }

  // Create sandbox directory
  fs.mkdirSync(sandboxPath, { recursive: true })

  // Copy template files
  copyDirectory(templatePath, sandboxPath)

  // Copy UI components and styles from Fulcrum frontend
  copyFulcrumAssets(sandboxPath)

  // Initialize git repository
  execSync('git init', { cwd: sandboxPath, stdio: 'pipe' })
  execSync('git add -A', { cwd: sandboxPath, stdio: 'pipe' })
  execSync('git commit -m "Initial sandbox setup"', { cwd: sandboxPath, stdio: 'pipe' })

  log.assistant.info('Sandbox repository initialized', { path: sandboxPath })
}

/**
 * Find the sandbox template directory
 */
function findSandboxTemplate(): string | null {
  // Look for template in common locations
  const possiblePaths = [
    // Development: relative to server directory
    path.join(__dirname, '../../sandbox'),
    // Installed: in the package
    path.join(__dirname, '../../../sandbox'),
    // CLI installation
    path.join(process.cwd(), 'sandbox'),
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(path.join(p, 'package.json'))) {
      return p
    }
  }

  return null
}

/**
 * Find the Fulcrum frontend directory
 */
function findFrontendDir(): string | null {
  const possiblePaths = [
    // Development: relative to server directory
    path.join(__dirname, '../../frontend'),
    // Installed: in the package
    path.join(__dirname, '../../../frontend'),
    // CLI installation
    path.join(process.cwd(), 'frontend'),
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(path.join(p, 'components', 'ui'))) {
      return p
    }
  }

  return null
}

/**
 * Copy Fulcrum UI components, CSS, and utils to sandbox
 */
function copyFulcrumAssets(sandboxPath: string): void {
  const frontendDir = findFrontendDir()
  if (!frontendDir) {
    log.assistant.warn('Frontend directory not found, skipping asset copy')
    return
  }

  log.assistant.info('Copying Fulcrum assets to sandbox', { frontendDir, sandboxPath })

  // Copy UI components
  const uiSrc = path.join(frontendDir, 'components', 'ui')
  const uiDest = path.join(sandboxPath, 'src', 'components', 'ui')
  if (fs.existsSync(uiSrc)) {
    fs.mkdirSync(uiDest, { recursive: true })
    copyDirectory(uiSrc, uiDest)
    log.assistant.debug('Copied UI components', { from: uiSrc, to: uiDest })
  }

  // Copy lib/utils.ts
  const utilsSrc = path.join(frontendDir, 'lib', 'utils.ts')
  const utilsDest = path.join(sandboxPath, 'src', 'lib', 'utils.ts')
  if (fs.existsSync(utilsSrc)) {
    fs.mkdirSync(path.dirname(utilsDest), { recursive: true })
    fs.copyFileSync(utilsSrc, utilsDest)
    log.assistant.debug('Copied utils.ts', { from: utilsSrc, to: utilsDest })
  }

  // Copy CSS - merge with existing or replace
  const cssSrc = path.join(frontendDir, 'index.css')
  const cssDest = path.join(sandboxPath, 'src', 'index.css')
  if (fs.existsSync(cssSrc)) {
    // Read the frontend CSS but filter out imports that won't work in sandbox
    let css = fs.readFileSync(cssSrc, 'utf-8')

    // Remove imports that are specific to Fulcrum and not needed in sandbox
    const importsToRemove = [
      '@import "@azurity/pure-nerd-font/pure-nerd-font.css";',
      '@import "@xterm/xterm/css/xterm.css";',
    ]
    for (const imp of importsToRemove) {
      css = css.replace(imp, '')
    }

    fs.writeFileSync(cssDest, css, 'utf-8')
    log.assistant.debug('Copied and adapted index.css', { from: cssSrc, to: cssDest })
  }

  log.assistant.info('Fulcrum assets copied to sandbox')
}

/**
 * Recursively copy a directory
 */
function copyDirectory(src: string, dest: string): void {
  const entries = fs.readdirSync(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    // Skip node_modules and .git
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue
    }

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true })
      copyDirectory(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

/**
 * Create a new worktree for a chat session
 */
export function createChatWorktree(sessionId: string): { worktreePath: string; branch: string } {
  // Ensure sandbox is initialized
  if (!isSandboxInitialized()) {
    initializeSandbox()
  }

  const sandboxPath = getSandboxRepoPath()
  const worktreesDir = getWorktreesDir()
  const branch = `chat-${sessionId}`
  const worktreePath = path.join(worktreesDir, branch)

  // Ensure worktrees directory exists
  fs.mkdirSync(worktreesDir, { recursive: true })

  log.assistant.info('Creating chat worktree', { sessionId, branch, worktreePath })

  try {
    // Create worktree with new branch
    execSync(`git worktree add -b "${branch}" "${worktreePath}" HEAD`, {
      cwd: sandboxPath,
      stdio: 'pipe',
    })

    log.assistant.info('Chat worktree created', { sessionId, worktreePath })
    return { worktreePath, branch }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.assistant.error('Failed to create chat worktree', { sessionId, error: message })
    throw new Error(`Failed to create chat worktree: ${message}`)
  }
}

/**
 * Delete a chat worktree
 */
export function deleteChatWorktree(worktreePath: string): void {
  const sandboxPath = getSandboxRepoPath()

  if (!fs.existsSync(worktreePath)) {
    log.assistant.debug('Worktree already deleted', { worktreePath })
    return
  }

  log.assistant.info('Deleting chat worktree', { worktreePath })

  try {
    // Remove worktree
    execSync(`git worktree remove --force "${worktreePath}"`, {
      cwd: sandboxPath,
      stdio: 'pipe',
    })
  } catch {
    // Fallback to manual deletion
    fs.rmSync(worktreePath, { recursive: true, force: true })
    execSync('git worktree prune', {
      cwd: sandboxPath,
      stdio: 'pipe',
    })
  }

  log.assistant.info('Chat worktree deleted', { worktreePath })
}

/**
 * Get the content path for an artifact within a worktree
 */
export function getArtifactContentPath(worktreePath: string, artifactId: string): string {
  const artifactsDir = path.join(worktreePath, 'src', 'artifacts')
  return path.join(artifactsDir, artifactId)
}

/**
 * Create an artifact directory within a worktree
 */
export function createArtifactDir(worktreePath: string, artifactId: string): string {
  const artifactPath = getArtifactContentPath(worktreePath, artifactId)
  fs.mkdirSync(artifactPath, { recursive: true })
  return artifactPath
}

/**
 * Write artifact content to a file
 */
export function writeArtifactContent(
  worktreePath: string,
  artifactId: string,
  filename: string,
  content: string
): string {
  const artifactDir = createArtifactDir(worktreePath, artifactId)
  const filePath = path.join(artifactDir, filename)
  fs.writeFileSync(filePath, content, 'utf-8')
  return filePath
}

/**
 * Read artifact content from a file
 */
export function readArtifactContent(contentPath: string, filename: string): string | null {
  const filePath = path.join(contentPath, filename)
  if (!fs.existsSync(filePath)) {
    return null
  }
  return fs.readFileSync(filePath, 'utf-8')
}

/**
 * Find an available port starting from a base port
 */
async function findAvailablePort(startPort: number = 5175): Promise<number> {
  const isPortAvailable = (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const server = net.createServer()
      server.once('error', () => resolve(false))
      server.once('listening', () => {
        server.close()
        resolve(true)
      })
      server.listen(port)
    })
  }

  let port = startPort
  // Try up to 100 ports
  for (let i = 0; i < 100; i++) {
    if (await isPortAvailable(port)) {
      return port
    }
    port++
  }
  throw new Error(`No available ports found starting from ${startPort}`)
}

/**
 * Start a dev server for a chat session's sandbox
 */
export async function startDevServer(sessionId: string, worktreePath: string): Promise<number> {
  // Check if already running
  const existing = devServers.get(sessionId)
  if (existing) {
    log.assistant.debug('Dev server already running', { sessionId, port: existing.port })
    return existing.port
  }

  // Check if node_modules exists, if not install dependencies
  const nodeModulesPath = path.join(worktreePath, 'node_modules')
  if (!fs.existsSync(nodeModulesPath)) {
    log.assistant.info('Installing sandbox dependencies', { sessionId, worktreePath })
    try {
      execSync('bun install', { cwd: worktreePath, stdio: 'pipe' })
    } catch (err) {
      log.assistant.error('Failed to install sandbox dependencies', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      })
      throw new Error('Failed to install sandbox dependencies')
    }
  }

  // Try ports starting from 5175, using --strictPort to fail fast if port is taken
  const MAX_RETRIES = 20
  let port = 5175

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const candidatePort = port + attempt

    log.assistant.info('Attempting to start sandbox dev server', { sessionId, worktreePath, port: candidatePort })

    try {
      const actualPort = await tryStartDevServer(sessionId, worktreePath, candidatePort)
      log.assistant.info('Dev server started', { sessionId, port: actualPort })
      return actualPort
    } catch (err) {
      log.assistant.debug('Port unavailable, trying next', { sessionId, port: candidatePort })
      continue
    }
  }

  throw new Error(`Failed to find available port after ${MAX_RETRIES} attempts`)
}

/**
 * Try to start a dev server on a specific port
 * Returns the port if successful, throws if the port is taken
 */
async function tryStartDevServer(sessionId: string, worktreePath: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    // Start the dev server with --strictPort to fail if port is taken
    const devProcess = spawn('bun', ['run', 'dev', '--port', String(port), '--strictPort'], {
      cwd: worktreePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    })

    let startupOutput = ''
    let resolved = false

    const handleOutput = (data: Buffer) => {
      const output = data.toString()
      startupOutput += output
      log.assistant.debug('Dev server output', { sessionId, output: output.trim() })

      // Check for successful start (Vite prints the URL when ready)
      if (output.includes(`localhost:${port}`) || output.includes(`http://`)) {
        if (!resolved) {
          resolved = true
          devServers.set(sessionId, { process: devProcess, port })
          resolve(port)
        }
      }

      // Check for port conflict error
      if (output.includes('Port') && output.includes('is in use')) {
        if (!resolved) {
          resolved = true
          devProcess.kill()
          reject(new Error(`Port ${port} is in use`))
        }
      }
    }

    devProcess.stdout?.on('data', handleOutput)
    devProcess.stderr?.on('data', handleOutput)

    // Handle process exit
    devProcess.on('exit', (code) => {
      log.assistant.info('Dev server exited', { sessionId, code })
      devServers.delete(sessionId)
      if (!resolved) {
        resolved = true
        reject(new Error(`Dev server exited with code ${code}`))
      }
    })

    devProcess.on('error', (err) => {
      log.assistant.error('Dev server error', { sessionId, error: err.message })
      devServers.delete(sessionId)
      if (!resolved) {
        resolved = true
        reject(err)
      }
    })

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        // Assume it started if no error after timeout
        devServers.set(sessionId, { process: devProcess, port })
        resolve(port)
      }
    }, 10000)
  })
}

/**
 * Stop a running dev server
 */
export function stopDevServer(sessionId: string): void {
  const server = devServers.get(sessionId)
  if (!server) {
    log.assistant.debug('No dev server to stop', { sessionId })
    return
  }

  log.assistant.info('Stopping dev server', { sessionId, port: server.port })

  try {
    // Kill the process and its children
    if (server.process.pid) {
      process.kill(-server.process.pid, 'SIGTERM')
    }
  } catch {
    // Process may already be dead
    try {
      server.process.kill('SIGTERM')
    } catch {
      // Ignore
    }
  }

  devServers.delete(sessionId)
  log.assistant.info('Dev server stopped', { sessionId })
}

/**
 * Get the port of a running dev server
 */
export function getDevServerPort(sessionId: string): number | null {
  const server = devServers.get(sessionId)
  return server?.port ?? null
}

/**
 * Check if a dev server is running for a session
 */
export function isDevServerRunning(sessionId: string): boolean {
  return devServers.has(sessionId)
}

/**
 * Get all running dev servers
 */
export function getAllDevServers(): Map<string, { process: ChildProcess; port: number }> {
  return devServers
}
