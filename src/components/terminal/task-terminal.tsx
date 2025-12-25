import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal as XTerm, ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { cn } from '@/lib/utils'
import { desktopZoom } from '@/main'
import { useTerminalWS } from '@/hooks/use-terminal-ws'
import { useKeyboardContext } from '@/contexts/keyboard-context'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDownDoubleIcon } from '@hugeicons/core-free-icons'
import { MobileTerminalControls } from './mobile-terminal-controls'
import { log } from '@/lib/logger'
import { useTheme } from 'next-themes'

const lightTheme: ITheme = {
  background: '#faf9f5',           // Porcelain
  foreground: '#2a2a27',           // Graphite
  cursor: '#2a2a27',               // Graphite
  cursorAccent: '#faf9f5',         // Porcelain
  selectionBackground: '#d1d5db',
  black: '#2a2a27',                // Graphite
  red: '#dd403a',                  // Cinnabar
  green: '#0d5c63',                // Stormy Teal
  yellow: '#dd403a',               // Cinnabar (warm accent)
  blue: '#0d5c63',                 // Stormy Teal
  magenta: '#8d909b',              // Lavender Grey
  cyan: '#0d5c63',                 // Stormy Teal
  white: '#faf9f5',                // Porcelain
  brightBlack: '#8d909b',          // Lavender Grey
  brightRed: '#dd403a',            // Cinnabar
  brightGreen: '#0d5c63',          // Stormy Teal
  brightYellow: '#dd403a',         // Cinnabar (warm accent)
  brightBlue: '#0d5c63',           // Stormy Teal
  brightMagenta: '#8d909b',        // Lavender Grey
  brightCyan: '#0d5c63',           // Stormy Teal
  brightWhite: '#faf9f5',          // Porcelain
}

const darkTheme: ITheme = {
  background: '#2a2a27',           // Graphite
  foreground: '#faf9f5',           // Porcelain
  cursor: '#faf9f5',               // Porcelain
  cursorAccent: '#2a2a27',         // Graphite
  selectionBackground: '#3d3d3a',
  black: '#2a2a27',                // Graphite
  red: '#dd403a',                  // Cinnabar
  green: '#0d5c63',                // Stormy Teal
  yellow: '#dd403a',               // Cinnabar (warm accent)
  blue: '#0d5c63',                 // Stormy Teal
  magenta: '#8d909b',              // Lavender Grey
  cyan: '#0d5c63',                 // Stormy Teal
  white: '#faf9f5',                // Porcelain
  brightBlack: '#8d909b',          // Lavender Grey
  brightRed: '#dd403a',            // Cinnabar
  brightGreen: '#0d5c63',          // Stormy Teal
  brightYellow: '#dd403a',         // Cinnabar (warm accent)
  brightBlue: '#0d5c63',           // Stormy Teal
  brightMagenta: '#8d909b',        // Lavender Grey
  brightCyan: '#0d5c63',           // Stormy Teal
  brightWhite: '#faf9f5',          // Porcelain
}

interface TaskTerminalProps {
  taskName: string
  cwd: string | null
  className?: string
  aiMode?: 'default' | 'plan'
  description?: string
  startupScript?: string | null
}

export function TaskTerminal({ taskName, cwd, className, aiMode, description, startupScript }: TaskTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const createdTerminalRef = useRef(false)
  const attachedRef = useRef(false)
  // Track if THIS component instance created the terminal (for startup command decision)
  const createdByMeRef = useRef(false)
  // Track which terminal we've run startup commands for (prevents re-running on effect re-runs)
  const startupRanForRef = useRef<string | null>(null)
  const [terminalId, setTerminalId] = useState<string | null>(null)
  const [xtermOpened, setXtermOpened] = useState(false)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const terminalTheme = isDark ? darkTheme : lightTheme

  // Reset all terminal tracking refs when cwd changes (navigating to different task)
  // This MUST run before terminal creation logic to ensure refs are clean
  useEffect(() => {
    log.taskTerminal.debug('cwd changed, resetting refs', { cwd })
    createdTerminalRef.current = false
    createdByMeRef.current = false
    attachedRef.current = false
    startupRanForRef.current = null
    setTerminalId(null)
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
  } = useTerminalWS()

  // Store callbacks in refs to avoid effect re-runs when they change
  const attachXtermRef = useRef(attachXterm)
  const setupImagePasteRef = useRef(setupImagePaste)
  const writeToTerminalRef = useRef(writeToTerminal)

  useEffect(() => { attachXtermRef.current = attachXterm }, [attachXterm])
  useEffect(() => { setupImagePasteRef.current = setupImagePaste }, [setupImagePaste])
  useEffect(() => { writeToTerminalRef.current = writeToTerminal }, [writeToTerminal])

  // Get the current terminal's status
  const currentTerminal = terminalId ? terminals.find((t) => t.id === terminalId) : null
  const terminalStatus = currentTerminal?.status

  // Initialize xterm first
  useEffect(() => {
    if (!containerRef.current || termRef.current) return

    const term = new XTerm({
      cursorBlink: true,
      fontSize: Math.round(13 * desktopZoom),
      fontFamily: 'JetBrains Mono Variable, Menlo, Monaco, monospace',
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
      createdByMeRef.current = true  // Mark that THIS component created the terminal
      const { cols, rows } = termRef.current
      createTerminal({
        name: taskName,
        cols,
        rows,
        cwd,
      })
    }
  }, [connected, cwd, xtermOpened, terminalsLoaded, terminals, taskName, createTerminal])

  // Update terminalId when terminal appears in list
   
  useEffect(() => {
    if (!cwd || terminalId) return
    const newTerminal = terminals.find((t) => t.cwd === cwd)
    if (newTerminal) {
      setTerminalId(newTerminal.id)
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

    // Capture current values for use in callbacks
    const currentTerminalId = terminalId
    const currentStartupScript = startupScript
    const currentAiMode = aiMode
    const currentDescription = description
    const currentTaskName = taskName

    // Callback when terminal is fully attached (buffer received from server)
    const onAttached = () => {
      // Trigger a resize after attaching
      requestAnimationFrame(doFit)

      // SYNCHRONOUS guard: Check and set atomically to prevent race conditions
      // This must happen BEFORE any async operations
      if (startupRanForRef.current === currentTerminalId) {
        log.taskTerminal.debug('onAttached: startup already ran, returning', { terminalId: currentTerminalId })
        return
      }

      // Use createdByMeRef to determine if THIS component created the terminal
      // This avoids cross-instance issues with multiple useTerminalWS hooks
      const isNewTerminal = createdByMeRef.current

      // Clear the flag BEFORE any async operations (synchronous)
      createdByMeRef.current = false

      // Mark that we've run startup for this terminal IMMEDIATELY (before async operations)
      // This prevents duplicate execution from React Strict Mode or effect re-runs
      if (isNewTerminal) {
        startupRanForRef.current = currentTerminalId
      }

      log.taskTerminal.debug('onAttached checking isNewTerminal', {
        terminalId: currentTerminalId,
        isNewTerminal,
        startupRanFor: startupRanForRef.current,
      })

      // Run startup commands only if this is a newly created terminal (not restored from persistence)
      if (isNewTerminal) {
        log.taskTerminal.info('onAttached: running startup commands', { terminalId: currentTerminalId })
        // 1. Run startup script first (e.g., mise trust, mkdir .vibora, export VIBORA_DIR)
        if (currentStartupScript) {
          setTimeout(() => {
            // Write the script as-is - newlines act as Enter presses in terminals
            writeToTerminalRef.current(currentTerminalId, currentStartupScript + '\r')
          }, 100)
        }

        // 2. Then run Claude with the task prompt
        const systemPrompt = 'You are working in a Vibora task worktree. ' +
          'When you finish working and need user input, run: vibora current-task review. ' +
          'When linking a PR: vibora current-task pr <url>. ' +
          'For notifications: vibora notify "Title" "Message".'
        const taskInfo = currentDescription ? `${currentTaskName}: ${currentDescription}` : currentTaskName
        const prompt = taskInfo.replace(/"/g, '\\"')
        const escapedSystemPrompt = systemPrompt.replace(/"/g, '\\"')

        const taskCommand = currentAiMode === 'plan'
          ? `claude "${prompt}" --append-system-prompt "${escapedSystemPrompt}" --session-id "${currentTerminalId}" --allow-dangerously-skip-permissions --permission-mode plan`
          : `claude "${prompt}" --append-system-prompt "${escapedSystemPrompt}" --session-id "${currentTerminalId}" --dangerously-skip-permissions`

        setTimeout(() => {
          log.taskTerminal.debug('writing claude command to terminal', {
            terminalId: currentTerminalId,
            taskCommand: taskCommand.substring(0, 50) + '...',
          })
          writeToTerminalRef.current(currentTerminalId, taskCommand + '\r')
        }, currentStartupScript ? 300 : 100)
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
  }, [terminalId, doFit, startupScript, aiMode, description, taskName])

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
      <div className={cn('flex h-full items-center justify-center text-muted-foreground text-sm', isDark ? 'bg-[#2a2827]' : 'bg-[#faf9f5]', className)}>
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
      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          className={cn('h-full w-full overflow-hidden p-2', isDark ? 'bg-[#2a2827]' : 'bg-[#faf9f5]', className)}
        />
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
