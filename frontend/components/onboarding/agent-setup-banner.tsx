import { useState, useCallback } from 'react'
import { useSystemDependencies } from '@/hooks/use-system-dependencies'
import { useDefaultAgent } from '@/hooks/use-config'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert02Icon, Cancel01Icon, Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import type { AgentType } from '@/types'

const AGENT_CONFIG: Record<AgentType, { name: string; installCommand: string; docsUrl: string }> = {
  claude: {
    name: 'Claude Code',
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    docsUrl: 'https://docs.anthropic.com/en/docs/claude-code/overview',
  },
  opencode: {
    name: 'OpenCode',
    installCommand: 'curl -fsSL https://opencode.ai/install | bash',
    docsUrl: 'https://opencode.ai/docs/',
  },
}

export function AgentSetupBanner() {
  const { data: dependencies, isLoading: depsLoading } = useSystemDependencies()
  const { data: defaultAgent, isLoading: agentLoading } = useDefaultAgent()
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState(false)

  const agentToCheck = defaultAgent ?? 'claude'
  const config = AGENT_CONFIG[agentToCheck]

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(config.installCommand)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for browsers without clipboard API
    }
  }, [config.installCommand])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
  }, [])

  if (depsLoading || agentLoading || dismissed) {
    return null
  }

  const isInstalled = agentToCheck === 'claude'
    ? dependencies?.claudeCode?.installed
    : dependencies?.openCode?.installed

  if (isInstalled) {
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
            {config.name} CLI not found
          </span>
          <div className="flex items-center gap-2">
            <code className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-mono text-amber-700 dark:text-amber-300">
              {config.installCommand}
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
          href={config.docsUrl}
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

export { AgentSetupBanner as ClaudeSetupBanner }
