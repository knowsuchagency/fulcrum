import { execSync, spawnSync } from 'node:child_process'

/**
 * Dependency definition for Vibora's required and optional tools.
 */
export interface Dependency {
  name: string
  command: string
  description: string
  required: boolean
  install: {
    brew?: string
    apt?: string
    dnf?: string
    pacman?: string
    npm?: string
    curl?: string
  }
}

/**
 * Status of a dependency check.
 */
export interface DependencyStatus {
  name: string
  command: string
  description: string
  required: boolean
  installed: boolean
  version: string | null
}

/**
 * All dependencies that Vibora uses.
 */
export const DEPENDENCIES: Dependency[] = [
  {
    name: 'bun',
    command: 'bun',
    description: 'Runtime for Vibora server',
    required: true,
    install: {
      brew: 'brew install oven-sh/bun/bun',
      curl: 'curl -fsSL https://bun.sh/install | bash',
    },
  },
  {
    name: 'dtach',
    command: 'dtach',
    description: 'Terminal session persistence',
    required: true,
    install: {
      brew: 'brew install dtach',
      apt: 'sudo apt install -y dtach',
      dnf: 'sudo dnf install -y dtach',
      pacman: 'sudo pacman -S --noconfirm dtach',
    },
  },
  {
    name: 'claude',
    command: 'claude',
    description: 'Claude Code CLI for AI agents',
    required: false,
    install: {
      curl: 'curl -fsSL https://claude.ai/install.sh | bash',
    },
  },
  {
    name: 'opencode',
    command: 'opencode',
    description: 'OpenCode CLI for AI agents',
    required: false,
    install: {
      curl: 'curl -fsSL https://opencode.ai/install | bash',
    },
  },
  {
    name: 'uv',
    command: 'uv',
    description: 'Fast Python package manager',
    required: true,
    install: {
      brew: 'brew install uv',
      curl: 'curl -LsSf https://astral.sh/uv/install.sh | sh',
    },
  },
  {
    name: 'gh',
    command: 'gh',
    description: 'GitHub CLI for PR creation',
    required: false,
    install: {
      brew: 'brew install gh',
      apt: 'sudo apt install -y gh',
      dnf: 'sudo dnf install -y gh',
      pacman: 'sudo pacman -S --noconfirm github-cli',
    },
  },
]

/**
 * Detect which package manager is available.
 */
export function detectPackageManager(): 'brew' | 'apt' | 'dnf' | 'pacman' | null {
  const managers = ['brew', 'apt', 'dnf', 'pacman'] as const
  for (const pm of managers) {
    try {
      execSync(`which ${pm}`, { stdio: 'ignore' })
      return pm
    } catch {
      // Not found, try next
    }
  }
  return null
}

/**
 * Check if a command is installed (either as an executable in PATH or as a shell alias).
 */
export function isCommandInstalled(command: string): boolean {
  // First try `which` for executables in PATH (fast path)
  try {
    execSync(`which ${command}`, { stdio: 'ignore' })
    return true
  } catch {
    // Not in PATH, continue to check for aliases
  }

  // Check for shell aliases by running an interactive shell
  // This loads the user's shell config (.bashrc, .zshrc, etc.)
  return isShellAlias(command)
}

/**
 * Check if a command is defined as a shell alias.
 * Uses an interactive shell to load the user's shell configuration.
 */
export function isShellAlias(command: string): boolean {
  const shell = process.env.SHELL || '/bin/bash'
  const shellName = shell.split('/').pop() || 'bash'

  // Use `type` builtin which works in both bash and zsh
  // The -i flag makes the shell interactive, loading aliases from config files
  // We need to redirect stderr because some shells print warnings
  try {
    execSync(`${shellName} -ic "type ${command}" 2>/dev/null`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Get the version of an installed command.
 * Falls back to interactive shell if direct execution fails (for aliases).
 */
export function getCommandVersion(command: string): string | null {
  // Try direct execution first (fast path for executables in PATH)
  try {
    const output = execSync(`${command} --version`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    return output.trim().split('\n')[0]
  } catch {
    // Direct execution failed, try via interactive shell for aliases
  }

  // Try via interactive shell (for aliases)
  const shell = process.env.SHELL || '/bin/bash'
  const shellName = shell.split('/').pop() || 'bash'
  try {
    const output = execSync(`${shellName} -ic "${command} --version" 2>/dev/null`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    return output.trim().split('\n')[0]
  } catch {
    return null
  }
}

/**
 * Check a single dependency.
 */
export function checkDependency(dep: Dependency): DependencyStatus {
  const installed = isCommandInstalled(dep.command)
  return {
    name: dep.name,
    command: dep.command,
    description: dep.description,
    required: dep.required,
    installed,
    version: installed ? getCommandVersion(dep.command) : null,
  }
}

/**
 * Check all dependencies.
 */
export function checkAllDependencies(): DependencyStatus[] {
  return DEPENDENCIES.map(checkDependency)
}

/**
 * Get the install command for a dependency on the current platform.
 */
export function getInstallCommand(dep: Dependency): string {
  const pm = detectPackageManager()

  // Try package manager first
  if (pm && dep.install[pm]) {
    return dep.install[pm]!
  }

  // Fall back to npm if available
  if (dep.install.npm) {
    return dep.install.npm
  }

  // Fall back to curl if available
  if (dep.install.curl) {
    return dep.install.curl
  }

  // Return whatever is available
  const available = Object.values(dep.install).filter(Boolean)
  return available[0] || `Please install ${dep.name} manually`
}

/**
 * Get the install method name for display.
 */
export function getInstallMethod(dep: Dependency): string {
  const pm = detectPackageManager()

  if (pm && dep.install[pm]) {
    const methodNames: Record<string, string> = {
      brew: 'Homebrew',
      apt: 'apt',
      dnf: 'dnf',
      pacman: 'pacman',
    }
    return methodNames[pm] || pm
  }

  if (dep.install.npm) {
    return 'npm'
  }

  if (dep.install.curl) {
    return 'curl script'
  }

  return 'manual installation'
}

/**
 * Install a dependency using the appropriate method.
 * Returns true if installation succeeded.
 */
export function installDependency(dep: Dependency): boolean {
  const cmd = getInstallCommand(dep)
  console.error(`Running: ${cmd}`)
  const result = spawnSync(cmd, { shell: true, stdio: 'inherit' })
  return result.status === 0
}

/**
 * Get a dependency by name.
 */
export function getDependency(name: string): Dependency | undefined {
  return DEPENDENCIES.find((d) => d.name === name)
}

/**
 * Get all required dependencies.
 */
export function getRequiredDependencies(): Dependency[] {
  return DEPENDENCIES.filter((d) => d.required)
}

/**
 * Get all optional dependencies.
 */
export function getOptionalDependencies(): Dependency[] {
  return DEPENDENCIES.filter((d) => !d.required)
}
