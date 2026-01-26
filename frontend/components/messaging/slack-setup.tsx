/**
 * Slack Setup Component - Bot and app token auth with Socket Mode
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon, Logout01Icon, Tick02Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import {
  useSlackStatus,
  useEnableSlack,
  useDisableSlack,
  useDisconnectSlack,
  useSlackSessions,
} from '@/hooks/use-messaging'

interface SlackSetupProps {
  isLoading?: boolean
}

export function SlackSetup({ isLoading = false }: SlackSetupProps) {
  const { data: status, refetch: refetchStatus } = useSlackStatus()
  const { data: sessions } = useSlackSessions()
  const enableSlack = useEnableSlack()
  const disableSlack = useDisableSlack()
  const disconnect = useDisconnectSlack()

  const [botToken, setBotToken] = useState('')
  const [appToken, setAppToken] = useState('')
  const [showTokenInput, setShowTokenInput] = useState(false)

  const isConnected = status?.status === 'connected'
  const isConnecting = status?.status === 'connecting'
  const isEnabled = status?.enabled ?? false

  const handleToggle = async (enabled: boolean) => {
    try {
      if (enabled) {
        setShowTokenInput(true)
      } else {
        await disableSlack.mutateAsync()
        setShowTokenInput(false)
        setBotToken('')
        setAppToken('')
        refetchStatus()
      }
    } catch {
      toast.error('Failed to disable Slack')
    }
  }

  const handleConnect = async () => {
    if (!botToken.trim()) {
      toast.error('Please enter a bot token')
      return
    }
    if (!appToken.trim()) {
      toast.error('Please enter an app token')
      return
    }

    try {
      await enableSlack.mutateAsync({
        botToken: botToken.trim(),
        appToken: appToken.trim(),
      })
      setShowTokenInput(false)
      setBotToken('')
      setAppToken('')
      toast.success('Slack connected')
      refetchStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to connect Slack')
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnect.mutateAsync()
      toast.success('Slack disconnected')
    } catch {
      toast.error('Failed to disconnect Slack')
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

  const isPending = enableSlack.isPending || disableSlack.isPending || disconnect.isPending

  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="text-sm text-muted-foreground sm:w-40 sm:shrink-0">
          Slack
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

      {/* Token inputs */}
      {showTokenInput && !isConnected && (
        <div className="ml-4 sm:ml-44 space-y-3">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Bot Token (xoxb-...)</label>
            <Input
              type="password"
              placeholder="xoxb-your-bot-token"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              className="max-w-md font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">App Token (xapp-...)</label>
            <Input
              type="password"
              placeholder="xapp-your-app-token"
              value={appToken}
              onChange={(e) => setAppToken(e.target.value)}
              className="max-w-md font-mono text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleConnect}
              disabled={isPending || !botToken.trim() || !appToken.trim()}
            >
              {enableSlack.isPending ? (
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
                setAppToken('')
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
      <p className="ml-4 sm:ml-44 text-xs text-muted-foreground">
        Create a Slack app at{' '}
        <a
          href="https://api.slack.com/apps"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          api.slack.com
        </a>
        . Enable Socket Mode to get an App Token (xapp-...) and install the app to get a Bot Token (xoxb-...).
        Required scopes: chat:write, im:history, im:read, im:write, users:read.
        DM the bot to chat with the AI assistant.
      </p>
    </div>
  )
}
