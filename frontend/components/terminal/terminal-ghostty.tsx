import { useEffect, useRef, useCallback, useState } from 'react'
import { init, Terminal as GhosttyTerminal, FitAddon } from 'ghostty-web'
import type { ITheme as GhosttyTheme } from 'ghostty-web'

import { cn } from '@/lib/utils'
import { useKeyboardContext } from '@/contexts/keyboard-context'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDownDoubleIcon } from '@hugeicons/core-free-icons'
import { MobileTerminalControls } from './mobile-terminal-controls'
import { useTheme } from 'next-themes'
import { lightTheme, darkTheme } from './terminal-theme'
import { log } from '@/lib/logger'

// Create a Ghostty-compatible theme from xterm theme
function toGhosttyTheme(xtermTheme: typeof lightTheme): GhosttyTheme {
  return {
    background: xtermTheme.background,
    foreground: xtermTheme.foreground,
    cursor: xtermTheme.cursor,
    cursorAccent: xtermTheme.cursorAccent,
    selectionBackground: xtermTheme.selectionBackground,
    black: xtermTheme.black,
    red: xtermTheme.red,
    green: xtermTheme.green,
    yellow: xtermTheme.yellow,
    blue: xtermTheme.blue,
    magenta: xtermTheme.magenta,
    cyan: xtermTheme.cyan,
    white: xtermTheme.white,
    brightBlack: xtermTheme.brightBlack,
    brightRed: xtermTheme.brightRed,
    brightGreen: xtermTheme.brightGreen,
    brightYellow: xtermTheme.brightYellow,
    brightBlue: xtermTheme.brightBlue,
    brightMagenta: xtermTheme.brightMagenta,
    brightCyan: xtermTheme.brightCyan,
    brightWhite: xtermTheme.brightWhite,
  }
}

interface TerminalGhosttyProps {
  className?: string
  onReady?: (terminal: GhosttyTerminal) => void
  onResize?: (cols: number, rows: number) => void
  onContainerReady?: (container: HTMLDivElement) => void
  terminalId?: string
  setupImagePaste?: (container: HTMLElement, terminalId: string) => () => void
  onSend?: (data: string) => void
  onFocus?: () => void
}

// WASM initialization state (singleton)
let wasmInitPromise: Promise<void> | null = null
let wasmInitialized = false

async function ensureWasmInitialized(): Promise<void> {
  if (wasmInitialized) return
  if (!wasmInitPromise) {
    wasmInitPromise = init().then(() => {
      wasmInitialized = true
    })
  }
  return wasmInitPromise
}

export function TerminalGhostty({ className, onReady, onResize, onContainerReady, terminalId, setupImagePaste, onSend, onFocus }: TerminalGhosttyProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<GhosttyTerminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const onResizeRef = useRef(onResize)
  const onFocusRef = useRef(onFocus)
  const onReadyRef = useRef(onReady)
  const onContainerReadyRef = useRef(onContainerReady)
  const { setTerminalFocused } = useKeyboardContext()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const terminalTheme = isDark ? darkTheme : lightTheme

  // VibeTunnel's scroll management pattern:
  // Auto-disable follow when user scrolls up
  const followCursorEnabledRef = useRef(true)
  const [showScrollButton, setShowScrollButton] = useState(false)

  // Keep refs updated
  useEffect(() => {
    onResizeRef.current = onResize
  }, [onResize])

  useEffect(() => {
    onFocusRef.current = onFocus
  }, [onFocus])

  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  useEffect(() => {
    onContainerReadyRef.current = onContainerReady
  }, [onContainerReady])

  const doFit = useCallback(() => {
    if (!fitAddonRef.current || !termRef.current) return

    fitAddonRef.current.fit()
    const { cols, rows } = termRef.current
    onResizeRef.current?.(cols, rows)
  }, [])

  useEffect(() => {
    if (!containerRef.current || termRef.current) return

    let mounted = true

    // Initialize WASM and create terminal
    ensureWasmInitialized()
      .then(() => {
        if (!mounted || !containerRef.current) return

        const term = new GhosttyTerminal({
          cursorBlink: true,
          fontSize: 14,
          fontFamily: 'monospace',
          theme: toGhosttyTheme(terminalTheme),
          scrollback: 10000,
        })

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        term.open(containerRef.current)

        termRef.current = term
        fitAddonRef.current = fitAddon

        // VibeTunnel's scroll management pattern:
        // Auto-disable follow when user scrolls up
        const scrollDisposable = term.onScroll(() => {
          const viewportFromBottom = term.getViewportY()
          // If viewport is near the bottom (within 0.5 lines), enable follow
          // Otherwise user has scrolled up, disable follow
          const shouldFollow = viewportFromBottom <= 0.5
          followCursorEnabledRef.current = shouldFollow
          setShowScrollButton(!shouldFollow)
          log.terminal.debug('scroll event', { viewportFromBottom, shouldFollow })
        })

        // Initial fit after container is sized
        requestAnimationFrame(() => {
          doFit()
          onReadyRef.current?.(term)
          if (containerRef.current) {
            onContainerReadyRef.current?.(containerRef.current)
          }
        })

        // Track terminal focus for keyboard shortcuts
        const handleTerminalFocus = () => {
          setTerminalFocused(true)
          onFocusRef.current?.()
        }
        const handleTerminalBlur = () => setTerminalFocused(false)

        // Ghostty creates a hidden textarea for keyboard input - track its focus
        if (term.textarea) {
          term.textarea.addEventListener('focus', handleTerminalFocus)
          term.textarea.addEventListener('blur', handleTerminalBlur)
        }

        // Schedule additional fits to catch async layout (ResizablePanel timing)
        const refitTimeout = setTimeout(() => {
          doFit()
        }, 100)

        const handleResize = () => {
          requestAnimationFrame(doFit)
        }

        window.addEventListener('resize', handleResize)

        // Handle document visibility changes (browser tab switches)
        const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') {
            requestAnimationFrame(() => {
              doFit()
            })
          }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)

        // Use ResizeObserver for container size changes
        const resizeObserver = new ResizeObserver(handleResize)
        resizeObserver.observe(containerRef.current)

        // Use IntersectionObserver to handle terminals becoming visible after being hidden
        const visibilityObserver = new IntersectionObserver(
          (entries) => {
            if (entries[0]?.isIntersecting) {
              requestAnimationFrame(() => {
                doFit()
              })
            }
          },
          { threshold: 0.1 }
        )
        visibilityObserver.observe(containerRef.current)

        // Store cleanup for unmount
        const cleanup = () => {
          clearTimeout(refitTimeout)
          window.removeEventListener('resize', handleResize)
          document.removeEventListener('visibilitychange', handleVisibilityChange)
          resizeObserver.disconnect()
          visibilityObserver.disconnect()
          scrollDisposable.dispose()
          if (term.textarea) {
            term.textarea.removeEventListener('focus', handleTerminalFocus)
            term.textarea.removeEventListener('blur', handleTerminalBlur)
          }
          setTerminalFocused(false)
          term.dispose()
          termRef.current = null
          fitAddonRef.current = null
        }

        // Store cleanup function
        ;(termRef as { current: GhosttyTerminal | null & { _cleanup?: () => void } }).current = Object.assign(term, { _cleanup: cleanup })
      })
      .catch((err) => {
        log.terminal.error('Failed to initialize Ghostty WASM', { error: err })
      })

    return () => {
      mounted = false
      const term = termRef.current as (GhosttyTerminal & { _cleanup?: () => void }) | null
      if (term?._cleanup) {
        term._cleanup()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- terminalTheme excluded: theme updates handled by separate effect
  }, [doFit, setTerminalFocused])

  // Set up image paste when terminalId is available
  useEffect(() => {
    if (!containerRef.current || !terminalId || !setupImagePaste) return
    const cleanup = setupImagePaste(containerRef.current, terminalId)
    return cleanup
  }, [terminalId, setupImagePaste])

  // Update terminal theme when system theme changes
  useEffect(() => {
    if (!termRef.current) return
    // Ghostty doesn't have a direct theme update API like xterm
    // We need to update options. The theme is part of the constructor options.
    // For now, we can update through the options proxy if available
    const term = termRef.current
    if ('options' in term && term.options) {
      term.options.theme = toGhosttyTheme(terminalTheme)
    }
  }, [terminalTheme])

  const handleScrollToBottom = useCallback(() => {
    termRef.current?.scrollToBottom()
    followCursorEnabledRef.current = true
    setShowScrollButton(false)
  }, [])

  return (
    <div className="flex h-full w-full max-w-full flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          className={cn('h-full w-full max-w-full overflow-hidden p-2 bg-terminal-background', className)}
        />
        {showScrollButton && (
          <button
            onClick={handleScrollToBottom}
            className={cn('absolute top-2 right-5 p-1 transition-colors', isDark ? 'text-white/50 hover:text-white/80' : 'text-black/50 hover:text-black/80')}
          >
            <HugeiconsIcon icon={ArrowDownDoubleIcon} size={20} strokeWidth={2} />
          </button>
        )}
      </div>
      <div className="h-2 shrink-0 bg-terminal-background" />
      {onSend && <MobileTerminalControls onSend={onSend} />}
    </div>
  )
}

/**
 * Write data to a Ghostty terminal with VibeTunnel's scroll management.
 * Only scrolls to bottom after write if user hasn't scrolled up.
 */
export function writeWithScrollManagement(
  terminal: GhosttyTerminal,
  data: string | Uint8Array,
  followCursorEnabled: boolean,
  callback?: () => void
): void {
  terminal.write(data, () => {
    if (followCursorEnabled) {
      terminal.scrollToBottom()
    }
    callback?.()
  })
}
