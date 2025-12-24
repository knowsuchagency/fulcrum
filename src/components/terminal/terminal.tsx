import { useEffect, useRef, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { cn } from '@/lib/utils'
import { desktopZoom } from '@/main'
import { useKeyboardContext } from '@/contexts/keyboard-context'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDownDoubleIcon } from '@hugeicons/core-free-icons'
import { MobileTerminalControls } from './mobile-terminal-controls'

interface TerminalProps {
  className?: string
  onReady?: (terminal: XTerm) => void
  onResize?: (cols: number, rows: number) => void
  onContainerReady?: (container: HTMLDivElement) => void
  terminalId?: string
  setupImagePaste?: (container: HTMLElement, terminalId: string) => () => void
  onSend?: (data: string) => void
  onFocus?: () => void
}

export function Terminal({ className, onReady, onResize, onContainerReady, terminalId, setupImagePaste, onSend, onFocus }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const onResizeRef = useRef(onResize)
  const onFocusRef = useRef(onFocus)
  const onReadyRef = useRef(onReady)
  const onContainerReadyRef = useRef(onContainerReady)
  const { setTerminalFocused } = useKeyboardContext()

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

    const term = new XTerm({
      cursorBlink: true,
      fontSize: Math.round(13 * desktopZoom),
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

    // Initial fit after container is sized, with delayed refit to catch layout stabilization
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

    // xterm creates a hidden textarea for keyboard input - track its focus
    if (term.textarea) {
      term.textarea.addEventListener('focus', handleTerminalFocus)
      term.textarea.addEventListener('blur', handleTerminalBlur)
    }

    // Schedule additional fits to catch async layout (ResizablePanel timing)
    const refitTimeout = setTimeout(() => {
      doFit()
      term.refresh(0, term.rows - 1)
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
          term.refresh(0, term.rows - 1)
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
            term.refresh(0, term.rows - 1)
          })
        }
      },
      { threshold: 0.1 }
    )
    visibilityObserver.observe(containerRef.current)

    return () => {
      clearTimeout(refitTimeout)
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      resizeObserver.disconnect()
      visibilityObserver.disconnect()
      if (term.textarea) {
        term.textarea.removeEventListener('focus', handleTerminalFocus)
        term.textarea.removeEventListener('blur', handleTerminalBlur)
      }
      setTerminalFocused(false)
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
  }, [doFit, setTerminalFocused])

  // Set up image paste when terminalId is available
  useEffect(() => {
    if (!containerRef.current || !terminalId || !setupImagePaste) return
    const cleanup = setupImagePaste(containerRef.current, terminalId)
    return cleanup
  }, [terminalId, setupImagePaste])

  const handleScrollToBottom = useCallback(() => {
    termRef.current?.scrollToBottom()
  }, [])

  return (
    <div className="flex h-full w-full max-w-full flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          className={cn('h-full w-full max-w-full overflow-hidden bg-[#0a0a0a] p-2', className)}
        />
        <button
          onClick={handleScrollToBottom}
          className="absolute top-2 right-5 p-1 text-white/50 hover:text-white/80 transition-colors"
        >
          <HugeiconsIcon icon={ArrowDownDoubleIcon} size={20} strokeWidth={2} />
        </button>
      </div>
      {onSend && <MobileTerminalControls onSend={onSend} />}
    </div>
  )
}
