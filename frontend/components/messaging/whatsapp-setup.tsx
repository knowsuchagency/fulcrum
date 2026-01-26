/**
 * WhatsApp Setup Component - QR code auth and connection status
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon, Logout01Icon, RefreshIcon, Tick02Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import {
  useWhatsAppStatus,
  useEnableWhatsApp,
  useDisableWhatsApp,
  useRequestWhatsAppAuth,
  useDisconnectWhatsApp,
  useWhatsAppSessions,
} from '@/hooks/use-messaging'

interface WhatsAppSetupProps {
  isLoading?: boolean
}

export function WhatsAppSetup({ isLoading = false }: WhatsAppSetupProps) {
  const { data: status, refetch: refetchStatus } = useWhatsAppStatus()
  const { data: sessions } = useWhatsAppSessions()
  const enableWhatsApp = useEnableWhatsApp()
  const disableWhatsApp = useDisableWhatsApp()
  const requestAuth = useRequestWhatsAppAuth()
  const disconnect = useDisconnectWhatsApp()

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  const isConnected = status?.status === 'connected'
  const isConnecting = status?.status === 'connecting'
  const isQrPending = status?.status === 'qr_pending'
  const isEnabled = status?.enabled ?? false

  const handleToggle = async (enabled: boolean) => {
    try {
      if (enabled) {
        await enableWhatsApp.mutateAsync()
        // Request QR code after enabling
        const result = await requestAuth.mutateAsync()
        setQrDataUrl(result.qrDataUrl)
      } else {
        await disableWhatsApp.mutateAsync()
        setQrDataUrl(null)
      }
      refetchStatus()
    } catch {
      toast.error(enabled ? 'Failed to enable WhatsApp' : 'Failed to disable WhatsApp')
    }
  }

  const handleRequestQR = async () => {
    try {
      const result = await requestAuth.mutateAsync()
      setQrDataUrl(result.qrDataUrl)
    } catch {
      toast.error('Failed to generate QR code')
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnect.mutateAsync()
      setQrDataUrl(null)
      toast.success('WhatsApp disconnected')
    } catch {
      toast.error('Failed to disconnect WhatsApp')
    }
  }

  const getStatusIcon = () => {
    if (isConnected) {
      return <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} className="text-green-500" />
    }
    if (isConnecting || isQrPending) {
      return <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin text-yellow-500" />
    }
    return <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} className="text-muted-foreground" />
  }

  const getStatusText = () => {
    if (isConnected) {
      return status?.displayName ? `Connected as ${status.displayName}` : 'Connected'
    }
    if (isConnecting) return 'Connecting...'
    if (isQrPending) return 'Scan QR code'
    return 'Disconnected'
  }

  const isPending = enableWhatsApp.isPending || disableWhatsApp.isPending || requestAuth.isPending || disconnect.isPending

  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="text-sm text-muted-foreground sm:w-40 sm:shrink-0">
          WhatsApp
        </label>
        <div className="flex items-center gap-3">
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            disabled={isLoading || isPending}
          />
          <span className="flex items-center gap-2 text-sm">
            {getStatusIcon()}
            <span className="text-muted-foreground">{getStatusText()}</span>
          </span>
        </div>
      </div>

      {/* QR Code display */}
      {isEnabled && (qrDataUrl || isQrPending) && !isConnected && (
        <div className="ml-4 sm:ml-44">
          <div className="rounded-lg border border-border bg-white p-4 inline-block">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="WhatsApp QR Code"
                className="w-48 h-48"
              />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center">
                <HugeiconsIcon icon={Loading03Icon} size={32} strokeWidth={2} className="animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Scan this QR code with WhatsApp on your phone
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRequestQR}
            disabled={isPending}
            className="mt-2"
          >
            <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={2} className="mr-2" />
            Refresh QR
          </Button>
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
        Connect WhatsApp to chat with the AI assistant via your phone. Send any message to start a conversation, or use /reset to start fresh.
      </p>
    </div>
  )
}
