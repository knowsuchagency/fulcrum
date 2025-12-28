import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { cn } from '@/lib/utils'
import { desktopZoom } from '@/main'
import { useTerminalWS } from '@/hooks/use-terminal-ws'
import { useKeyboardContext } from '@/contexts/keyboard-context'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDownDoubleIcon, Loading03Icon } from '@hugeicons/core-free-icons'
import { MobileTerminalControls } from './mobile-terminal-controls'
import { log } from '@/lib/logger'
import { useTheme } from 'next-themes'
import { lightTheme, darkTheme } from './terminal-theme'

interface TaskTerminalProps {
  taskName: string
  cwd: string | null
  className?: string
  aiMode?: 'default' | 'plan'
  description?: string
  startupScript?: string | null
  serverPort?: number
}

export function TaskTerminal({ taskName, cwd, className, aiMode, description, startupScript, serverPort = 7777 }: TaskTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const createdTerminalRef = useRef(false)
  const attachedRef = useRef(false)
  const [terminalId, setTerminalId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isStartingClaude, setIsStartingClaude] = useState(false)
  const [xtermOpened, setXtermOpened] = useState(false)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const terminalTheme = isDark ? darkTheme : lightTheme

  // Reset all terminal tracking refs when cwd changes (navigating to different task)
  // This MUST run before terminal creation logic to ensure refs are clean
  useEffect(() => {
    log.taskTerminal.debug('cwd changed, resetting refs', { cwd })
    createdTerminalRef.current = false
    attachedRef.current = false
    setTerminalId(null)
    setIsCreating(false)
  }, [cwd])

  const { setTerminalFocused } = useKeyboardContext()

  const {
    terminals,
    terminalsLoaded,
    connected,
    createTerminal,
    attachXterm,
    resizeTerminal,
    setupImagePaste,
    writeToTerminal,
    consumePendingStartup,
    clearStartingUp,
  } = useTerminalWS()

  // Store callbacks in refs to avoid effect re-runs when they change
  const attachXtermRef = useRef(attachXterm)
  const setupImagePasteRef = useRef(setupImagePaste)
  const writeToTerminalRef = useRef(writeToTerminal)
  const consumePendingStartupRef = useRef(consumePendingStartup)
  const clearStartingUpRef = useRef(clearStartingUp)

  useEffect(() => { attachXtermRef.current = attachXterm }, [attachXterm])
  useEffect(() => { setupImagePasteRef.current = setupImagePaste }, [setupImagePaste])
  useEffect(() => { writeToTerminalRef.current = writeToTerminal }, [writeToTerminal])
  useEffect(() => { consumePendingStartupRef.current = consumePendingStartup }, [consumePendingStartup])
  useEffect(() => { clearStartingUpRef.current = clearStartingUp }, [clearStartingUp])

  // Get the current terminal's status
  const currentTerminal = terminalId ? terminals.find((t) => t.id === terminalId) : null
  const terminalStatus = currentTerminal?.status

  // Initialize xterm first
  useEffect(() => {
    if (!containerRef.current || termRef.current) return

    const term = new XTerm({
      cursorBlink: true,
      fontSize: Math.round(13 * desktopZoom),
      fontFamily: 'JetBrains Mono Variable, PureNerdFont, Menlo, Monaco, monospace',
      lineHeight: 1.2,
      theme: terminalTheme,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(containerRef.current)

    termRef.current = term
    fitAddonRef.current = fitAddon

    // Mark xterm as opened synchronously - this gates terminal creation
    // We can get cols/rows immediately after open(), no need to wait for rAF
    setXtermOpened(true)

    // Initial fit after container is sized
    requestAnimationFrame(() => {
      fitAddon.fit()
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
      setXtermOpened(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- terminalTheme excluded: theme updates handled by separate effect
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
  // Use xtermOpened (not xtermReady) to avoid WebKit rAF timing issues during navigation
  useEffect(() => {
    if (!connected || !cwd || !xtermOpened || !terminalsLoaded) return

    // Look for an existing terminal with matching cwd
    const existingTerminal = terminals.find((t) => t.cwd === cwd)
    if (existingTerminal) {
      setTerminalId(existingTerminal.id)
      return
    }

    // Create terminal only once
    if (!createdTerminalRef.current && termRef.current) {
      createdTerminalRef.current = true
      setIsCreating(true)
      const { cols, rows } = termRef.current
      createTerminal({
        name: taskName,
        cols,
        rows,
        cwd,
        // Include startup info - this is stored in the MST store to survive
        // component unmount/remount (fixes race condition with React strict mode)
        startup: {
          startupScript,
          aiMode,
          description,
          taskName,
          serverPort,
        },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startup props are captured once at creation time
  }, [connected, cwd, xtermOpened, terminalsLoaded, terminals, taskName, createTerminal])

  // Update terminalId when terminal appears in list or when temp ID is replaced with real ID
  // This handles the optimistic update flow where tempId → realId

  useEffect(() => {
    if (!cwd) return

    const matchingTerminal = terminals.find((t) => t.cwd === cwd)

    if (!matchingTerminal) {
      // No terminal for this cwd yet
      return
    }

    // Update terminalId if:
    // 1. We don't have one yet, OR
    // 2. Current terminalId no longer exists in the list (was replaced)
    const currentTerminalExists = terminalId && terminals.some((t) => t.id === terminalId)

    if (!terminalId || !currentTerminalExists) {
      log.taskTerminal.debug('setting terminalId', {
        newId: matchingTerminal.id,
        prevId: terminalId,
        reason: !terminalId ? 'initial' : 'tempId replaced',
        cwd,
        terminalCount: terminals.length,
      })
      setTerminalId(matchingTerminal.id)
      setIsCreating(false)

      // Reset attachedRef when ID changes so the attach effect runs again
      if (terminalId && !currentTerminalExists) {
        attachedRef.current = false
      }
    }
  }, [terminals, cwd, terminalId])

  // Attach xterm to terminal once we have both
  // Use refs for callbacks to avoid effect re-runs when callbacks change identity
  useEffect(() => {
    log.taskTerminal.debug('attach effect', {
      terminalId,
      hasTermRef: !!termRef.current,
      hasContainerRef: !!containerRef.current,
      attachedRef: attachedRef.current,
    })

    if (!terminalId || !termRef.current || !containerRef.current || attachedRef.current) return

    log.taskTerminal.debug('attach effect passed guards, calling attachXterm', { terminalId })

    // Callback when terminal is fully attached (buffer received from server)
    // The actualTerminalId is passed by the MST store - use this instead of closed-over value
    // because after optimistic update, the tempId becomes realId.
    const onAttached = (actualTerminalId: string) => {
      // Trigger a resize after attaching
      requestAnimationFrame(doFit)

      // Check if this terminal has pending startup commands.
      // This is stored in the MST store (not a component ref) so it survives
      // component unmount/remount (fixes React strict mode race condition).
      // consumePendingStartup returns the startup info AND removes it from the store
      // to prevent duplicate execution.
      const pendingStartup = consumePendingStartupRef.current(actualTerminalId)

      log.taskTerminal.debug('onAttached checking pending startup', {
        terminalId: actualTerminalId,
        hasPendingStartup: !!pendingStartup,
      })

      // Run startup commands only if this is a newly created terminal (not restored from persistence)
      if (pendingStartup) {
        log.taskTerminal.info('onAttached: running startup commands', { terminalId: actualTerminalId })
        setIsStartingClaude(true)
        const { startupScript: currentStartupScript, aiMode: currentAiMode, description: currentDescription, taskName: currentTaskName, serverPort: currentServerPort } = pendingStartup

        // 1. Run startup script first (e.g., mise trust, mkdir .vibora, export VIBORA_DIR)
        // Use source with heredoc so exports persist in the current shell
        if (currentStartupScript) {
          setTimeout(() => {
            const wrappedScript = `source /dev/stdin <<'VIBORA_STARTUP'\n${currentStartupScript}\nVIBORA_STARTUP`
            writeToTerminalRef.current(actualTerminalId, wrappedScript + '\r')
          }, 100)
        }

        // 2. Then run Claude with the task prompt
        const effectivePort = currentServerPort ?? 7777
        const portFlag = effectivePort !== 7777 ? ` --port=${effectivePort}` : ''
        const systemPrompt = 'You are working in a Vibora task worktree. ' +
          'Commit after completing each logical unit of work (feature, fix, refactor) to preserve progress. ' +
          `When you finish working and need user input, run: vibora current-task review${portFlag}. ` +
          `When linking a PR: vibora current-task pr <url>${portFlag}. ` +
          `For notifications: vibora notify "Title" "Message"${portFlag}.`
        const taskInfo = currentDescription ? `${currentTaskName}: ${currentDescription}` : currentTaskName
        const prompt = taskInfo.replace(/"/g, '\\"')
        const escapedSystemPrompt = systemPrompt.replace(/"/g, '\\"')

        const taskCommand = currentAiMode === 'plan'
          ? `claude "${prompt}" --append-system-prompt "${escapedSystemPrompt}" --session-id "${actualTerminalId}" --allow-dangerously-skip-permissions --permission-mode plan`
          : `claude "${prompt}" --append-system-prompt "${escapedSystemPrompt}" --session-id "${actualTerminalId}" --dangerously-skip-permissions`

        // Wait longer for startup script to complete before sending Claude command
        // 5 seconds should be enough for most scripts (mise trust, mkdir, export, etc.)
        setTimeout(() => {
          log.taskTerminal.debug('writing claude command to terminal', {
            terminalId: actualTerminalId,
            taskCommand: taskCommand.substring(0, 50) + '...',
          })
          writeToTerminalRef.current(actualTerminalId, taskCommand + '\r')
          setIsStartingClaude(false)
          // Clear the MST store's isStartingUp flag (for /terminals view)
          clearStartingUpRef.current(actualTerminalId)
        }, currentStartupScript ? 5000 : 100)
      }
    }

    const cleanup = attachXtermRef.current(terminalId, termRef.current, { onAttached })
    // Set up image paste handler
    const cleanupPaste = setupImagePasteRef.current(containerRef.current, terminalId)
    attachedRef.current = true

    log.taskTerminal.debug('attachedRef set to true', { terminalId })

    return () => {
      log.taskTerminal.debug('cleanup running, setting attachedRef to false', { terminalId })
      cleanup()
      cleanupPaste()
      attachedRef.current = false
    }
    // Note: startup info is now stored in MST store and retrieved via consumePendingStartup,
    // so we don't need startupScript, aiMode, description, taskName, serverPort as dependencies
  }, [terminalId, doFit])

  // Update terminal theme when system theme changes
  useEffect(() => {
    if (!termRef.current) return
    termRef.current.options.theme = terminalTheme
  }, [terminalTheme])

  // Callback for mobile terminal controls
  const handleMobileSend = useCallback((data: string) => {
    if (terminalId) {
      writeToTerminalRef.current(terminalId, data)
    }
  }, [terminalId])

  if (!cwd) {
    return (
      <div className={cn('flex h-full items-center justify-center text-muted-foreground text-sm bg-terminal-background', className)}>
        No worktree path configured for this task
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Status bar */}
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

      {/* Terminal */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          className={cn('h-full w-full overflow-hidden p-2 bg-terminal-background', className)}
        />

        {/* Loading overlay - shown while terminal is being created */}
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

        {/* Loading overlay - shown while Claude is starting */}
        {isStartingClaude && (
          <div className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-terminal-background/90">
            <div className="flex flex-col items-center gap-3">
              <HugeiconsIcon
                icon={Loading03Icon}
                size={24}
                strokeWidth={2}
                className={cn('animate-spin', isDark ? 'text-white/60' : 'text-black/60')}
              />
              <span className={cn('font-mono text-sm', isDark ? 'text-white/60' : 'text-black/60')}>
                Starting Claude Code...
              </span>
            </div>
          </div>
        )}

        <button
          onClick={() => termRef.current?.scrollToBottom()}
          className={cn('absolute top-2 right-5 p-1 transition-colors', isDark ? 'text-white/50 hover:text-white/80' : 'text-black/50 hover:text-black/80')}
        >
          <HugeiconsIcon icon={ArrowDownDoubleIcon} size={20} strokeWidth={2} />
        </button>
      </div>

      {/* Mobile Controls */}
      <MobileTerminalControls onSend={handleMobileSend} />
    </div>
  )
}
