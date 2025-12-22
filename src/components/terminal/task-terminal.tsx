import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { cn } from '@/lib/utils'
import { useTerminalWS } from '@/hooks/use-terminal-ws'
import { useTaskCreationCommand } from '@/hooks/use-config'
import { useKeyboardContext } from '@/contexts/keyboard-context'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDownDoubleIcon } from '@hugeicons/core-free-icons'

interface TaskTerminalProps {
  taskId: string
  taskName: string
  cwd: string | null
  className?: string
  aiMode?: 'default' | 'plan' | 'none'
  description?: string
  startupScript?: string | null
}

export function TaskTerminal({ taskName, cwd, className, aiMode, description, startupScript }: TaskTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const createdTerminalRef = useRef(false)
  const attachedRef = useRef(false)
  const [terminalId, setTerminalId] = useState<string | null>(null)
  const [xtermReady, setXtermReady] = useState(false)

  const { data: taskCreationCommand } = useTaskCreationCommand()
  const { setTerminalFocused } = useKeyboardContext()

  const {
    terminals,
    terminalsLoaded,
    connected,
    newTerminalIds,
    createTerminal,
    attachXterm,
    resizeTerminal,
    setupImagePaste,
    writeToTerminal,
  } = useTerminalWS()

  // Get the current terminal's status
  const currentTerminal = terminalId ? terminals.find((t) => t.id === terminalId) : null
  const terminalStatus = currentTerminal?.status

  // Initialize xterm first
  useEffect(() => {
    if (!containerRef.current || termRef.current) return

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'JetBrains Mono Variable, Menlo, Monaco, monospace',
      lineHeight: 1.2,
      theme: {
        background: '#0a0a0a',
        foreground: '#e4e4e7',
        cursor: '#e4e4e7',
        cursorAccent: '#0a0a0a',
        selectionBackground: '#3f3f46',
        black: '#18181b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#fafafa',
      },
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(containerRef.current)

    termRef.current = term
    fitAddonRef.current = fitAddon

    // Initial fit after container is sized
    requestAnimationFrame(() => {
      fitAddon.fit()
      setXtermReady(true)
    })

    // Schedule additional fit to catch async layout (ResizablePanel timing)
    const refitTimeout = setTimeout(() => {
      fitAddon.fit()
      term.refresh(0, term.rows - 1)
    }, 100)

    // Track terminal focus for keyboard shortcuts
    const handleTerminalFocus = () => setTerminalFocused(true)
    const handleTerminalBlur = () => setTerminalFocused(false)

    // xterm creates a hidden textarea for keyboard input - track its focus
    if (term.textarea) {
      term.textarea.addEventListener('focus', handleTerminalFocus)
      term.textarea.addEventListener('blur', handleTerminalBlur)
    }

    return () => {
      clearTimeout(refitTimeout)
      if (term.textarea) {
        term.textarea.removeEventListener('focus', handleTerminalFocus)
        term.textarea.removeEventListener('blur', handleTerminalBlur)
      }
      setTerminalFocused(false)
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
      setXtermReady(false)
    }
  }, [setTerminalFocused])

  // Handle resize
  const doFit = useCallback(() => {
    if (!fitAddonRef.current || !termRef.current) return

    fitAddonRef.current.fit()
    const { cols, rows } = termRef.current

    if (terminalId) {
      resizeTerminal(terminalId, cols, rows)
    }
  }, [terminalId, resizeTerminal])

  // Set up resize listeners
  useEffect(() => {
    if (!containerRef.current) return

    const handleResize = () => {
      requestAnimationFrame(doFit)
    }

    window.addEventListener('resize', handleResize)

    // Handle document visibility changes (browser tab switches)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestAnimationFrame(() => {
          doFit()
          if (termRef.current) {
            termRef.current.refresh(0, termRef.current.rows - 1)
          }
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(containerRef.current)

    // Use IntersectionObserver to handle terminals becoming visible after being hidden
    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          requestAnimationFrame(() => {
            doFit()
            if (termRef.current) {
              termRef.current.refresh(0, termRef.current.rows - 1)
            }
          })
        }
      },
      { threshold: 0.1 }
    )
    visibilityObserver.observe(containerRef.current)

    return () => {
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      resizeObserver.disconnect()
      visibilityObserver.disconnect()
    }
  }, [doFit])

  // Find existing terminal or create new one
  // Wait for terminalsLoaded to ensure we have accurate knowledge of existing terminals
  useEffect(() => {
    if (!connected || !cwd || !xtermReady || !terminalsLoaded) return

    // Look for an existing terminal with matching cwd
    const existingTerminal = terminals.find((t) => t.cwd === cwd)
    if (existingTerminal) {
      setTerminalId(existingTerminal.id)
      return
    }

    // Create terminal only once
    if (!createdTerminalRef.current && termRef.current) {
      createdTerminalRef.current = true
      const { cols, rows } = termRef.current
      createTerminal({
        name: taskName,
        cols,
        rows,
        cwd,
      })
    }
  }, [connected, cwd, xtermReady, terminalsLoaded, terminals, taskName, createTerminal])

  // Update terminalId when terminal appears in list
   
  useEffect(() => {
    if (!cwd || terminalId) return
    const newTerminal = terminals.find((t) => t.cwd === cwd)
    if (newTerminal) {
      setTerminalId(newTerminal.id)
    }
  }, [terminals, cwd, terminalId])

  // Attach xterm to terminal once we have both
  useEffect(() => {
    if (!terminalId || !termRef.current || !containerRef.current || attachedRef.current) return

    const isNewTerminal = newTerminalIds.has(terminalId)
    // Remove from set immediately so startup commands don't run again on re-mount
    if (isNewTerminal) {
      newTerminalIds.delete(terminalId)
    }

    // Callback when terminal is fully attached (buffer received from server)
    const onAttached = () => {
      // Trigger a resize after attaching
      requestAnimationFrame(doFit)

      // Run startup commands only if this is a newly created terminal (not restored from persistence)
      if (isNewTerminal) {
        // 1. Run startup script first (e.g., mise trust, mkdir .vibora, export VIBORA_DIR)
        if (startupScript) {
          setTimeout(() => {
            // Write the script as-is - newlines act as Enter presses in terminals
            writeToTerminal(terminalId, startupScript + '\r')
          }, 100)
        }

        // 2. Then run task creation command (e.g., claude agent)
        let taskCommand = taskCreationCommand
        if (aiMode === 'plan' && description) {
          const prompt = `${taskName}: ${description}`.replace(/"/g, '\\"')
          taskCommand = `claude "${prompt}" --allow-dangerously-skip-permissions --permission-mode plan`
        } else if (aiMode === 'default' && description) {
          const prompt = `${taskName}: ${description}`.replace(/"/g, '\\"')
          taskCommand = `claude "${prompt}" --dangerously-skip-permissions`
        }
        // else: use default taskCreationCommand (for 'none' or no description)
        if (taskCommand) {
          setTimeout(() => {
            writeToTerminal(terminalId, taskCommand + '\r')
          }, startupScript ? 300 : 100)
        }
      }
    }

    const cleanup = attachXterm(terminalId, termRef.current, { onAttached })
    // Set up image paste handler
    const cleanupPaste = setupImagePaste(containerRef.current, terminalId)
    attachedRef.current = true

    return () => {
      cleanup()
      cleanupPaste()
      attachedRef.current = false
    }
  }, [terminalId, attachXterm, setupImagePaste, cwd, doFit, taskCreationCommand, writeToTerminal, aiMode, description, taskName, startupScript, newTerminalIds])

  if (!cwd) {
    return (
      <div className={cn('flex h-full items-center justify-center bg-[#0a0a0a] text-muted-foreground text-sm', className)}>
        No worktree path configured for this task
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Status bar */}
      {!connected && (
        <div className="shrink-0 px-2 py-1 bg-yellow-500/20 text-yellow-500 text-xs">
          Connecting to terminal server...
        </div>
      )}
      {terminalStatus === 'error' && (
        <div className="shrink-0 px-2 py-1 bg-red-500/20 text-red-500 text-xs">
          Terminal failed to start. The worktree directory may not exist.
        </div>
      )}
      {terminalStatus === 'exited' && (
        <div className="shrink-0 px-2 py-1 bg-muted text-muted-foreground text-xs">
          Terminal exited (code: {currentTerminal?.exitCode})
        </div>
      )}

      {/* Terminal */}
      <div className="relative flex-1">
        <div
          ref={containerRef}
          className={cn('h-full w-full overflow-hidden bg-[#0a0a0a] p-2', className)}
        />
        <button
          onClick={() => termRef.current?.scrollToBottom()}
          className="absolute top-2 right-5 p-1 text-white/50 hover:text-white/80 transition-colors"
        >
          <HugeiconsIcon icon={ArrowDownDoubleIcon} size={20} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
