import { useEffect, useRef, useState, useCallback } from 'react'
import type { Terminal as XTerm } from '@xterm/xterm'
import { cn } from '@/lib/utils'
import { useTerminalWS } from '@/hooks/use-terminal-ws'
import { Terminal } from './terminal'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon } from '@hugeicons/core-free-icons'
import { MobileTerminalControls } from './mobile-terminal-controls'
import { useTheme } from 'next-themes'
import { log } from '@/lib/logger'

interface TaskShellTerminalProps {
  taskId: string
  taskName: string
  cwd: string | null
  className?: string
}

/**
 * A plain shell terminal for the task's worktree directory.
 * Unlike TaskTerminal, this does NOT start an AI agent — it's just a shell.
 * Uses a synthetic tabId (`task-shell:{taskId}`) to bypass the server's
 * duplicate-cwd detection (which only applies to terminals without a tabId).
 */
export function TaskShellTerminal({ taskId, taskName, cwd, className }: TaskShellTerminalProps) {
  const shellTabId = `task-shell:${taskId}`
  const [terminalId, setTerminalId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const xtermRef = useRef<XTerm | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const createdRef = useRef(false)
  const attachedRef = useRef(false)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const {
    terminals,
    terminalsLoaded,
    connected,
    createTerminal,
    attachXterm,
    resizeTerminal,
    setupImagePaste,
    writeToTerminal,
  } = useTerminalWS()

  const attachXtermRef = useRef(attachXterm)
  const setupImagePasteRef = useRef(setupImagePaste)
  useEffect(() => { attachXtermRef.current = attachXterm }, [attachXterm])
  useEffect(() => { setupImagePasteRef.current = setupImagePaste }, [setupImagePaste])

  const currentTerminal = terminalId ? terminals.find((t) => t.id === terminalId) : null
  const terminalStatus = currentTerminal?.status

  // Reset refs when cwd changes (navigating to different task)
  useEffect(() => {
    createdRef.current = false
    attachedRef.current = false
    setTerminalId(null)
    setIsCreating(false)
  }, [cwd])

  // Find existing or create new shell terminal
  useEffect(() => {
    if (!connected || !cwd || !terminalsLoaded) return

    // Find by synthetic tabId
    const existing = terminals.find((t) => t.tabId === shellTabId)
    if (existing) {
      log.taskTerminal.debug('Found existing shell terminal', { id: existing.id, shellTabId })
      setTerminalId(existing.id)
      setIsCreating(false)
      return
    }

    if (!createdRef.current && xtermRef.current) {
      log.taskTerminal.info('Creating shell terminal', { cwd, shellTabId })
      createdRef.current = true
      setIsCreating(true)
      const { cols, rows } = xtermRef.current
      createTerminal({
        name: `${taskName} (shell)`,
        cols,
        rows,
        cwd,
        tabId: shellTabId,
        taskId,
      })
    }
  }, [connected, cwd, terminalsLoaded, terminals, shellTabId, taskName, taskId, createTerminal])

  // Track terminal ID when it appears (optimistic tempId → realId)
  useEffect(() => {
    if (!cwd) return
    const match = terminals.find((t) => t.tabId === shellTabId)
    if (!match) return

    const currentExists = terminalId && terminals.some((t) => t.id === terminalId)
    if (!terminalId || !currentExists) {
      setTerminalId(match.id)
      setIsCreating(false)
      if (terminalId && !currentExists) {
        attachedRef.current = false
      }
    }
  }, [terminals, cwd, terminalId, shellTabId])

  // Attach xterm to terminal
  useEffect(() => {
    if (!terminalId || !xtermRef.current || !containerRef.current || attachedRef.current) return

    const onAttached = () => {
      // Trigger fit after attachment
      requestAnimationFrame(() => {
        // The Terminal component handles fitting internally
      })
    }

    const cleanup = attachXtermRef.current(terminalId, xtermRef.current, { onAttached })
    const cleanupPaste = setupImagePasteRef.current(containerRef.current, terminalId)
    attachedRef.current = true

    return () => {
      cleanup()
      cleanupPaste()
      attachedRef.current = false
    }
  }, [terminalId])

  const handleReady = useCallback((term: XTerm) => {
    xtermRef.current = term
  }, [])

  const handleResize = useCallback((cols: number, rows: number) => {
    if (terminalId) {
      resizeTerminal(terminalId, cols, rows)
    }
  }, [terminalId, resizeTerminal])

  const handleContainerReady = useCallback((container: HTMLDivElement) => {
    containerRef.current = container
  }, [])

  const handleMobileSend = useCallback((data: string) => {
    if (terminalId) {
      writeToTerminal(terminalId, data)
    }
  }, [terminalId, writeToTerminal])

  if (!cwd) {
    return (
      <div className={cn('flex h-full items-center justify-center text-muted-foreground text-sm bg-terminal-background', className)}>
        No worktree path configured for this task
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!connected && (
        <div className="shrink-0 px-2 py-1 bg-muted-foreground/20 text-muted-foreground text-xs">
          Connecting to terminal server...
        </div>
      )}
      {terminalStatus === 'error' && (
        <div className="shrink-0 px-2 py-1 bg-destructive/20 text-destructive text-xs">
          Terminal failed to start. The worktree directory may not exist.
        </div>
      )}
      {terminalStatus === 'exited' && (
        <div className="shrink-0 px-2 py-1 bg-muted text-muted-foreground text-xs">
          Terminal exited (code: {currentTerminal?.exitCode})
        </div>
      )}

      <div className="relative min-h-0 min-w-0 flex-1">
        <Terminal
          className={cn('h-full w-full overflow-hidden p-2 bg-terminal-background', className)}
          onReady={handleReady}
          onResize={handleResize}
          onContainerReady={handleContainerReady}
          terminalId={terminalId ?? undefined}
          setupImagePaste={setupImagePaste}
          onSend={handleMobileSend}
        />

        {isCreating && !terminalId && (
          <div className="absolute inset-0 flex items-center justify-center bg-terminal-background">
            <div className="flex flex-col items-center gap-3">
              <HugeiconsIcon
                icon={Loading03Icon}
                size={24}
                strokeWidth={2}
                className={cn('animate-spin', isDark ? 'text-white/50' : 'text-black/50')}
              />
              <span className={cn('font-mono text-sm', isDark ? 'text-white/50' : 'text-black/50')}>
                Initializing terminal...
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="h-2 shrink-0 bg-terminal-background" />
      <MobileTerminalControls onSend={handleMobileSend} />
    </div>
  )
}
