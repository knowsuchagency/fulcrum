import { useState, useCallback } from 'react'
import { useSystemDependencies } from '@/hooks/use-system-dependencies'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert02Icon, Cancel01Icon, Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

const INSTALL_COMMAND = 'npm install -g @anthropic/claude-code'
const CLAUDE_DOCS_URL = 'https://docs.anthropic.com/en/docs/claude-code/overview'

/**
 * Banner shown when Claude Code CLI is not installed.
 * Provides installation instructions and a link to the docs.
 */
export function ClaudeSetupBanner() {
  const { data, isLoading } = useSystemDependencies()
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for browsers without clipboard API
    }
  }, [])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
  }, [])

  // Don't show banner while loading or if dismissed
  if (isLoading || dismissed) {
    return null
  }

  // Don't show banner if Claude Code is installed
  if (data?.claudeCode?.installed) {
    return null
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-4 py-3',
        'border-b bg-amber-500/10 border-amber-500/30'
      )}
      role="alert"
    >
      <div className="flex items-center gap-3">
        <HugeiconsIcon
          icon={Alert02Icon}
          size={18}
          strokeWidth={2}
          className="shrink-0 text-amber-600 dark:text-amber-400"
        />
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
            Claude Code CLI not found
          </span>
          <div className="flex items-center gap-2">
            <code className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-mono text-amber-700 dark:text-amber-300">
              {INSTALL_COMMAND}
            </code>
            <button
              onClick={handleCopy}
              className={cn(
                'p-1 rounded transition-colors',
                'text-amber-600 hover:text-amber-700 hover:bg-amber-500/20',
                'dark:text-amber-400 dark:hover:text-amber-300'
              )}
              title={copied ? 'Copied!' : 'Copy to clipboard'}
            >
              <HugeiconsIcon
                icon={copied ? Tick02Icon : Copy01Icon}
                size={14}
                strokeWidth={2}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <a
          href={CLAUDE_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'text-xs font-medium px-2 py-1 rounded transition-colors',
            'text-amber-600 hover:text-amber-700 hover:bg-amber-500/20',
            'dark:text-amber-400 dark:hover:text-amber-300'
          )}
        >
          View Docs
        </a>
        <button
          onClick={handleDismiss}
          className={cn(
            'p-1 rounded transition-colors',
            'text-amber-600 hover:text-amber-700 hover:bg-amber-500/20',
            'dark:text-amber-400 dark:hover:text-amber-300'
          )}
          title="Dismiss"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
