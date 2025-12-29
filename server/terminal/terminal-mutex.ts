import { Mutex } from 'async-mutex'

/**
 * Per-terminal mutex locks to prevent race conditions in terminal operations.
 *
 * Race conditions we're protecting against:
 * 1. Concurrent attach() calls passing the isAttached check simultaneously
 * 2. Concurrent detach() calls while isDetaching flag is being toggled
 * 3. Concurrent destroy() calls causing double-delete
 * 4. attach() racing with destroy() or detach()
 *
 * Each terminal gets its own mutex, so operations on different terminals
 * can proceed in parallel while operations on the same terminal are serialized.
 */
class TerminalMutexManager {
  private locks = new Map<string, Mutex>()

  /**
   * Get or create a mutex for a specific terminal.
   */
  private getMutex(terminalId: string): Mutex {
    let mutex = this.locks.get(terminalId)
    if (!mutex) {
      mutex = new Mutex()
      this.locks.set(terminalId, mutex)
    }
    return mutex
  }

  /**
   * Execute a function while holding the mutex for a terminal.
   * Ensures only one operation runs at a time per terminal.
   */
  async withLock<T>(terminalId: string, fn: () => Promise<T> | T): Promise<T> {
    const mutex = this.getMutex(terminalId)
    return mutex.runExclusive(fn)
  }

  /**
   * Check if a terminal's mutex is currently locked.
   * Useful for debugging but should not be used for control flow.
   */
  isLocked(terminalId: string): boolean {
    const mutex = this.locks.get(terminalId)
    return mutex?.isLocked() ?? false
  }

  /**
   * Clean up mutex for a terminal that no longer exists.
   * Should be called after terminal is destroyed.
   */
  cleanup(terminalId: string): void {
    this.locks.delete(terminalId)
  }

  /**
   * Clean up all mutexes. Used during shutdown.
   */
  cleanupAll(): void {
    this.locks.clear()
  }
}

// Singleton instance
export const terminalMutex = new TerminalMutexManager()
