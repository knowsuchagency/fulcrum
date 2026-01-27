/**
 * Discord Setup Component - Bot token auth and connection status
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon, Logout01Icon, Tick02Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import {
  useDiscordStatus,
  useEnableDiscord,
  useDisableDiscord,
  useDisconnectDiscord,
  useDiscordSessions,
} from '@/hooks/use-messaging'

interface DiscordSetupProps {
  isLoading?: boolean
}

export function DiscordSetup({ isLoading = false }: DiscordSetupProps) {
  const { data: status, refetch: refetchStatus } = useDiscordStatus()
  const { data: sessions } = useDiscordSessions()
  const enableDiscord = useEnableDiscord()
  const disableDiscord = useDisableDiscord()
  const disconnect = useDisconnectDiscord()

  const [botToken, setBotToken] = useState('')
  const [showTokenInput, setShowTokenInput] = useState(false)

  const isConnected = status?.status === 'connected'
  const isConnecting = status?.status === 'connecting'
  const isEnabled = status?.enabled ?? false

  const handleToggle = async (enabled: boolean) => {
    try {
      if (enabled) {
        setShowTokenInput(true)
      } else {
        await disableDiscord.mutateAsync()
        setShowTokenInput(false)
        setBotToken('')
        refetchStatus()
      }
    } catch {
      toast.error('Failed to disable Discord')
    }
  }

  const handleConnect = async () => {
    if (!botToken.trim()) {
      toast.error('Please enter a bot token')
      return
    }

    try {
      await enableDiscord.mutateAsync(botToken.trim())
      setShowTokenInput(false)
      setBotToken('')
      toast.success('Discord connected')
      refetchStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to connect Discord')
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnect.mutateAsync()
      toast.success('Discord disconnected')
    } catch {
      toast.error('Failed to disconnect Discord')
    }
  }

  const getStatusIcon = () => {
    if (isConnected) {
      return <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} className="text-green-500" />
    }
    if (isConnecting) {
      return <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin text-yellow-500" />
    }
    return <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} className="text-muted-foreground" />
  }

  const getStatusText = () => {
    if (isConnected) {
      return status?.displayName ? `Connected as ${status.displayName}` : 'Connected'
    }
    if (isConnecting) return 'Connecting...'
    return 'Disconnected'
  }

  const isPending = enableDiscord.isPending || disableDiscord.isPending || disconnect.isPending

  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="text-sm text-muted-foreground sm:w-40 sm:shrink-0">
          Discord
        </label>
        <div className="flex items-center gap-3">
          <Switch
            checked={isEnabled || showTokenInput}
            onCheckedChange={handleToggle}
            disabled={isLoading || isPending}
          />
          <span className="flex items-center gap-2 text-sm">
            {getStatusIcon()}
            <span className="text-muted-foreground">{getStatusText()}</span>
          </span>
        </div>
      </div>

      {/* Token input */}
      {showTokenInput && !isConnected && (
        <div className="ml-4 sm:ml-44 space-y-3">
          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground">Bot Token</label>
            <Input
              type="password"
              placeholder="Enter your Discord bot token"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              className="max-w-md font-mono text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleConnect}
              disabled={isPending || !botToken.trim()}
            >
              {enableDiscord.isPending ? (
                <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="mr-2 animate-spin" />
              ) : null}
              Connect
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowTokenInput(false)
                setBotToken('')
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Connected state actions */}
      {isEnabled && isConnected && (
        <div className="ml-4 sm:ml-44 space-y-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={isPending}
          >
            <HugeiconsIcon icon={Logout01Icon} size={14} strokeWidth={2} className="mr-2" />
            Disconnect
          </Button>

          {/* Active sessions */}
          {sessions && sessions.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Active Conversations</h4>
              <div className="space-y-1">
                {sessions.map((session) => (
                  <div key={session.id} className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="font-mono">{session.channelUserId}</span>
                    {session.channelUserName && (
                      <span>({session.channelUserName})</span>
                    )}
                    <span className="text-muted-foreground/60">
                      Last: {new Date(session.lastMessageAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Help text */}
      <details className="ml-4 sm:ml-44 text-sm text-muted-foreground">
        <summary className="cursor-pointer hover:text-foreground">Setup instructions</summary>
        <ol className="mt-2 ml-4 space-y-1 list-decimal">
          <li>
            Go to the{' '}
            <a
              href="https://discord.com/developers/applications"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Discord Developer Portal
            </a>
          </li>
          <li>Create a new application and click <strong>Bot</strong> in the sidebar</li>
          <li>Click <strong>Reset Token</strong> to generate a bot token, then copy it</li>
          <li>Enable <strong>Message Content Intent</strong> under Privileged Gateway Intents</li>
          <li>Go to <strong>OAuth2 → URL Generator</strong> in the sidebar</li>
          <li>Select the <strong>bot</strong> scope (no permissions needed for DMs)</li>
          <li>Copy the generated URL and open it to invite the bot to a server you're in</li>
          <li>Paste the bot token above and click Connect</li>
          <li>DM the bot in Discord to chat with the AI assistant</li>
        </ol>
      </details>
    </div>
  )
}
