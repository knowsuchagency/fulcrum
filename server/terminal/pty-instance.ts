import { PTYManager, type PTYManagerCallbacks } from './pty-manager'

// Singleton instance
let ptyManager: PTYManager | null = null
let broadcastFn: ((terminalId: string) => void) | null = null

export function initPTYManager(callbacks: PTYManagerCallbacks): PTYManager {
  ptyManager = new PTYManager(callbacks)
  return ptyManager
}

export function getPTYManager(): PTYManager {
  if (!ptyManager) {
    throw new Error('PTYManager not initialized. Call initPTYManager first.')
  }
  return ptyManager
}

export function setBroadcastDestroyed(fn: (terminalId: string) => void): void {
  broadcastFn = fn
}

export function destroyTerminalAndBroadcast(terminalId: string): boolean {
  const manager = getPTYManager()
  const success = manager.destroy(terminalId)
  if (success && broadcastFn) {
    broadcastFn(terminalId)
  }
  return success
}

// Kill Claude processes in all terminals for a worktree (keeps terminals running)
export function killClaudeInTerminalsForWorktree(worktreePath: string): number {
  const manager = getPTYManager()
  const terminals = manager.listTerminals()
  let count = 0

  for (const terminal of terminals) {
    if (terminal.cwd === worktreePath) {
      if (manager.killClaudeInTerminal(terminal.id)) {
        count++
      }
    }
  }

  return count
}
