import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { ClipboardAddon, type IClipboardProvider, type ClipboardSelectionType } from '@xterm/addon-clipboard'

const writeOnlyClipboardProvider: IClipboardProvider = {
  readText: () => '',
  writeText: (_selection: ClipboardSelectionType, text: string) => navigator.clipboard.writeText(text),
}
import '@xterm/xterm/css/xterm.css'
import { cn } from '@/lib/utils'
import { useTerminalWS } from '@/hooks/use-terminal-ws'
import { useKeyboardContext } from '@/contexts/keyboard-context'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDownDoubleIcon, Loading03Icon, Alert02Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { MobileTerminalControls } from './mobile-terminal-controls'
import { log } from '@/lib/logger'
import { useTheme } from 'next-themes'
import { lightTheme, darkTheme } from './terminal-theme'
import { buildAgentCommand, matchesAgentNotFound } from '@/lib/agent-commands'
import { AGENT_DISPLAY_NAMES, AGENT_INSTALL_COMMANDS, AGENT_DOC_URLS, type AgentType } from '@/types'
import { useOpencodeDefaultAgent, useOpencodePlanAgent } from '@/hooks/use-config'

interface TaskTerminalProps {
  taskName: string
  cwd: string | null
  taskId?: string
  className?: string
  agent?: AgentType
  aiMode?: 'default' | 'plan'
  description?: string
  startupScript?: string | null
  agentOptions?: Record<string, string> | null
  opencodeModel?: string | null
  serverPort?: number
  autoFocus?: boolean
}

export function TaskTerminal({ taskName, cwd, taskId, className, agent = 'claude', aiMode, description, startupScript, agentOptions, opencodeModel, serverPort = 7777, autoFocus = false }: TaskTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const hasFocusedRef = useRef(false)
  const autoFocusRef = useRef(autoFocus)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const clipboardAddonRef = useRef<ClipboardAddon | null>(null)
  const createdTerminalRef = useRef(false)
  const attachedRef = useRef(false)
  const [terminalId, setTerminalId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isStartingAgent, setIsStartingAgent] = useState(false)
  const [xtermOpened, setXtermOpened] = useState(false)
  const [agentNotFound, setAgentNotFound] = useState<AgentType | null>(null)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const terminalTheme = isDark ? darkTheme : lightTheme

  // Get global OpenCode agent name settings
  const { data: opencodeDefaultAgent } = useOpencodeDefaultAgent()
  const { data: opencodePlanAgent } = useOpencodePlanAgent()
  // Store in refs for use in callbacks
  const opencodeDefaultAgentRef = useRef(opencodeDefaultAgent)
  const opencodePlanAgentRef = useRef(opencodePlanAgent)
  useEffect(() => { opencodeDefaultAgentRef.current = opencodeDefaultAgent }, [opencodeDefaultAgent])
  useEffect(() => { opencodePlanAgentRef.current = opencodePlanAgent }, [opencodePlanAgent])

  // Reset all terminal tracking refs when cwd changes (navigating to different task)
  // This MUST run before terminal creation logic to ensure refs are clean
  useEffect(() => {
    log.taskTerminal.debug('cwd changed, resetting refs', { cwd })
    createdTerminalRef.current = false
    attachedRef.current = false
    hasFocusedRef.current = false
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
  useEffect(() => { autoFocusRef.current = autoFocus }, [autoFocus])

  // Get the current terminal's status
  const currentTerminal = terminalId ? terminals.find((t) => t.id === terminalId) : null
  const terminalStatus = currentTerminal?.status

  // Initialize xterm first
  useEffect(() => {
    if (!containerRef.current || termRef.current) return

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'monospace',
      theme: terminalTheme,
      scrollback: 10000,
      rightClickSelectsWord: true,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    const clipboardAddon = new ClipboardAddon(undefined, writeOnlyClipboardProvider)

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.loadAddon(clipboardAddon)
    term.open(containerRef.current)

    termRef.current = term
    fitAddonRef.current = fitAddon
    clipboardAddonRef.current = clipboardAddon

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
      clipboardAddonRef.current?.dispose()
      clipboardAddonRef.current = null
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
        taskId,
        // Include startup info - this is stored in the MST store to survive
        // component unmount/remount (fixes race condition with React strict mode)
        startup: {
          startupScript,
          agent,
          agentOptions,
          opencodeModel,
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
      if (!pendingStartup) {
        // No startup commands - focus immediately if autoFocus is enabled
        if (autoFocusRef.current && !hasFocusedRef.current && termRef.current) {
          const focusTerminal = () => {
            const term = termRef.current
            if (!hasFocusedRef.current && term) {
              term.focus()
              if (term.textarea === document.activeElement) {
                hasFocusedRef.current = true
              }
            }
          }
          setTimeout(focusTerminal, 50)
          setTimeout(focusTerminal, 200)
          setTimeout(focusTerminal, 500)
        }
        return
      }
      log.taskTerminal.info('onAttached: running startup commands', { terminalId: actualTerminalId })
      setIsStartingAgent(true)
      const {
        startupScript: currentStartupScript,
        agent: currentAgent = 'claude',
        agentOptions: currentAgentOptions,
        opencodeModel: currentOpencodeModel,
        aiMode: currentAiMode,
        description: currentDescription,
        taskName: currentTaskName,
        serverPort: currentServerPort,
      } = pendingStartup

      // 1. Run startup script first (e.g., mise trust, mkdir .vibora, export VIBORA_DIR)
      // Use source with heredoc so exports persist in the current shell
      if (currentStartupScript) {
        setTimeout(() => {
          const delimiter = 'VIBORA_STARTUP_' + Date.now()
          const wrappedScript = `source /dev/stdin <<'${delimiter}'\n${currentStartupScript}\n${delimiter}`
          writeToTerminalRef.current(actualTerminalId, wrappedScript + '\r')
        }, 100)
      }

      // 2. Build the agent command using the command builder abstraction
      const effectivePort = currentServerPort ?? 7777
      const portFlag = effectivePort !== 7777 ? ` --port=${effectivePort}` : ''
      const systemPrompt = 'You are working in a Vibora task worktree. ' +
        'Commit after completing each logical unit of work (feature, fix, refactor) to preserve progress. ' +
        `When you finish working and need user input, run: vibora current-task review${portFlag}. ` +
        `When linking a PR: vibora current-task pr <url>${portFlag}. ` +
        `When linking a Linear ticket: vibora current-task linear <url-or-ticket>${portFlag}. ` +
        `For notifications: vibora notify "Title" "Message"${portFlag}.`
      const taskInfo = currentDescription ? `${currentTaskName}: ${currentDescription}` : currentTaskName

      // Use the agent command builder to construct the appropriate CLI command
      const taskCommand = buildAgentCommand(currentAgent as AgentType, {
        prompt: taskInfo,
        systemPrompt,
        sessionId: actualTerminalId,
        mode: currentAiMode === 'plan' ? 'plan' : 'default',
        additionalOptions: currentAgentOptions ?? {},
        opencodeModel: currentOpencodeModel,
        opencodeDefaultAgent: opencodeDefaultAgentRef.current,
        opencodePlanAgent: opencodePlanAgentRef.current,
      })

      // Wait longer for startup script to complete before sending agent command
      // 5 seconds should be enough for most scripts (mise trust, mkdir, export, etc.)
      setTimeout(() => {
        writeToTerminalRef.current(actualTerminalId, taskCommand + '\r')
        setIsStartingAgent(false)
        // Clear the MST store's isStartingUp flag (for /terminals view)
        clearStartingUpRef.current(actualTerminalId)
        // Auto-focus terminal after agent starts
        if (autoFocusRef.current && !hasFocusedRef.current && termRef.current) {
          const focusTerminal = () => {
            const term = termRef.current
            if (!hasFocusedRef.current && term) {
              term.focus()
              if (term.textarea === document.activeElement) {
                hasFocusedRef.current = true
              }
            }
          }
          setTimeout(focusTerminal, 50)
          setTimeout(focusTerminal, 200)
          setTimeout(focusTerminal, 500)
        }
      }, currentStartupScript ? 5000 : 100)
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
    // Refresh to re-render existing content with new theme colors
    termRef.current.refresh(0, termRef.current.rows - 1)
  }, [terminalTheme])

  // Auto-focus terminal when ready - try multiple times to be aggressive
  useEffect(() => {
    if (!autoFocus || hasFocusedRef.current) return
    if (!termRef.current || !terminalId) return
    // Don't focus while overlay is showing
    if (isCreating || isStartingAgent) return

    // Try focusing multiple times with increasing delays
    const focusAttempts = [0, 50, 150, 300, 500]
    const timeouts: ReturnType<typeof setTimeout>[] = []

    focusAttempts.forEach((delay) => {
      const timeout = setTimeout(() => {
        const term = termRef.current
        if (!hasFocusedRef.current && term) {
          term.focus()
          if (term.textarea === document.activeElement) {
            hasFocusedRef.current = true
          }
        }
      }, delay)
      timeouts.push(timeout)
    })

    return () => {
      timeouts.forEach(clearTimeout)
    }
  }, [autoFocus, isCreating, isStartingAgent, terminalId])

  // Detect "command not found" for any AI agent CLI
  // This helps users who haven't installed the required agent yet
  useEffect(() => {
    if (!termRef.current || agentNotFound) return

    const term = termRef.current
    const checkForAgentNotFound = () => {
      const buffer = term.buffer.active
      // Check the last few lines of the terminal buffer
      for (let i = Math.max(0, buffer.cursorY - 3); i <= buffer.cursorY; i++) {
        const line = buffer.getLine(i)
        if (line) {
          const text = line.translateToString()
          // Use the agent command builder's not-found patterns
          const notFoundAgent = matchesAgentNotFound(text, agent)
          if (notFoundAgent) {
            setAgentNotFound(notFoundAgent)
            return
          }
        }
      }
    }

    // Check on line feed (new line added)
    const disposable = term.onLineFeed(checkForAgentNotFound)

    return () => {
      disposable.dispose()
    }
  }, [agentNotFound, agent])

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
      <div className="relative min-h-0 min-w-0 flex-1">
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

        {/* Loading overlay - shown while agent is starting */}
        {isStartingAgent && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-terminal-background/90">
            <div className="flex flex-col items-center gap-3">
              <HugeiconsIcon
                icon={Loading03Icon}
                size={24}
                strokeWidth={2}
                className={cn('animate-spin', isDark ? 'text-white/60' : 'text-black/60')}
              />
              <span className={cn('font-mono text-sm', isDark ? 'text-white/60' : 'text-black/60')}>
                Starting {AGENT_DISPLAY_NAMES[agent]}...
              </span>
            </div>
          </div>
        )}

        {/* Agent not found overlay - shown when "command not found" is detected */}
        {agentNotFound && (
          <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-10">
            <div className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border p-4',
              'bg-amber-500/10 border-amber-500/30'
            )}>
              <HugeiconsIcon
                icon={Alert02Icon}
                size={18}
                strokeWidth={2}
                className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"
              />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  {AGENT_DISPLAY_NAMES[agentNotFound]} CLI not found
                </p>
                <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                  Install it with:{' '}
                  <code className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono">
                    {AGENT_INSTALL_COMMANDS[agentNotFound]}
                  </code>
                </p>
                <a
                  href={AGENT_DOC_URLS[agentNotFound]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 underline"
                >
                  View documentation
                </a>
              </div>
              <button
                onClick={() => setAgentNotFound(null)}
                className="shrink-0 p-1 rounded text-amber-600 hover:text-amber-700 hover:bg-amber-500/20 dark:text-amber-400 dark:hover:text-amber-300"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
              </button>
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

      <div className="h-2 shrink-0 bg-terminal-background" />

      {/* Mobile Controls */}
      <MobileTerminalControls onSend={handleMobileSend} />
    </div>
  )
}
