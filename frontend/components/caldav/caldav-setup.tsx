/**
 * CalDAV Setup Component - Server config, connection test, sync controls
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon, Tick02Icon, Cancel01Icon, RefreshIcon } from '@hugeicons/core-free-icons'
import {
  useCaldavStatus,
  useTestCaldavConnection,
  useConfigureCaldav,
  useEnableCaldav,
  useDisableCaldav,
  useSyncCaldav,
} from '@/hooks/use-caldav'
import { useConfig, useUpdateConfig } from '@/hooks/use-config'

interface CaldavSetupProps {
  isLoading?: boolean
}

export function CaldavSetup({ isLoading = false }: CaldavSetupProps) {
  const { t } = useTranslation('settings')
  const { data: status, refetch: refetchStatus } = useCaldavStatus()
  const testConnection = useTestCaldavConnection()
  const configure = useConfigureCaldav()
  const enable = useEnableCaldav()
  const disable = useDisableCaldav()
  const sync = useSyncCaldav()
  const updateConfig = useUpdateConfig()

  // Read current settings to detect if credentials exist
  const { data: enabledConfig } = useConfig('caldav.enabled')
  const { data: serverUrlConfig } = useConfig('caldav.serverUrl')
  const hasCredentials = !!(serverUrlConfig?.value)
  const isEnabled = !!(enabledConfig?.value)

  const [showForm, setShowForm] = useState(false)
  const [serverUrl, setServerUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [syncInterval, setSyncInterval] = useState('15')

  const isConnected = status?.connected === true
  const isSyncing = status?.syncing === true

  const handleToggle = async (enabled: boolean) => {
    try {
      if (enabled) {
        if (hasCredentials) {
          await enable.mutateAsync()
          refetchStatus()
        } else {
          setShowForm(true)
        }
      } else {
        await disable.mutateAsync()
        setShowForm(false)
        refetchStatus()
      }
    } catch {
      toast.error(t('caldav.toggleFailed'))
    }
  }

  const handleTest = async () => {
    if (!serverUrl.trim() || !username.trim() || !password.trim()) {
      toast.error(t('caldav.fillRequired'))
      return
    }

    try {
      const result = await testConnection.mutateAsync({
        serverUrl: serverUrl.trim(),
        username: username.trim(),
        password: password.trim(),
      })
      if (result.success) {
        toast.success(t('caldav.testSuccess', { count: result.calendars ?? 0 }))
      } else {
        toast.error(result.error || t('caldav.testFailed'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('caldav.testFailed'))
    }
  }

  const handleConnect = async () => {
    if (!serverUrl.trim() || !username.trim() || !password.trim()) {
      toast.error(t('caldav.fillRequired'))
      return
    }

    try {
      await configure.mutateAsync({
        serverUrl: serverUrl.trim(),
        username: username.trim(),
        password: password.trim(),
        syncIntervalMinutes: parseInt(syncInterval, 10) || 15,
      })
      setShowForm(false)
      setServerUrl('')
      setUsername('')
      setPassword('')
      toast.success(t('caldav.configured'))
      refetchStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('caldav.configureFailed'))
    }
  }

  const handleSync = async () => {
    try {
      await sync.mutateAsync()
      toast.success(t('caldav.syncComplete'))
      refetchStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('caldav.syncFailed'))
    }
  }

  const handleDisconnect = async () => {
    try {
      await disable.mutateAsync()
      // Clear credentials
      await updateConfig.mutateAsync({ key: 'caldav.serverUrl', value: '' })
      await updateConfig.mutateAsync({ key: 'caldav.username', value: '' })
      await updateConfig.mutateAsync({ key: 'caldav.password', value: '' })
      toast.success(t('caldav.disconnected'))
      refetchStatus()
    } catch {
      toast.error(t('caldav.disconnectFailed'))
    }
  }

  const isPending =
    configure.isPending ||
    enable.isPending ||
    disable.isPending ||
    testConnection.isPending ||
    sync.isPending

  const getStatusIcon = () => {
    if (isConnected) {
      return <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} className="text-green-500" />
    }
    if (isSyncing) {
      return <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin text-yellow-500" />
    }
    return <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} className="text-muted-foreground" />
  }

  const getStatusText = () => {
    if (isConnected && !isSyncing) {
      return t('caldav.statusConnected', { count: status?.calendarCount ?? 0 })
    }
    if (isSyncing) return t('caldav.statusSyncing')
    if (status?.lastError) return t('caldav.statusError')
    return t('caldav.statusDisconnected')
  }

  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="text-sm text-muted-foreground sm:w-40 sm:shrink-0">
          {t('caldav.label')}
        </label>
        <div className="flex items-center gap-3">
          <Switch
            checked={isConnected || isEnabled || showForm}
            onCheckedChange={handleToggle}
            disabled={isLoading || isPending}
          />
          <span className="flex items-center gap-2 text-sm">
            {getStatusIcon()}
            <span className="text-muted-foreground">{getStatusText()}</span>
          </span>
        </div>
      </div>

      {/* Configuration form */}
      {showForm && !isConnected && (
        <div className="ml-4 sm:ml-44 space-y-3">
          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground">{t('caldav.serverUrl')}</label>
            <Input
              type="url"
              placeholder={t('caldav.serverUrlPlaceholder')}
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="max-w-md font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground">{t('caldav.username')}</label>
            <Input
              type="text"
              placeholder={t('caldav.usernamePlaceholder')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="max-w-md text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground">{t('caldav.password')}</label>
            <Input
              type="password"
              placeholder={t('caldav.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="max-w-md font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground">{t('caldav.syncInterval')}</label>
            <Input
              type="number"
              min={1}
              max={1440}
              value={syncInterval}
              onChange={(e) => setSyncInterval(e.target.value)}
              className="w-24 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleTest}
              disabled={isPending || !serverUrl.trim() || !username.trim() || !password.trim()}
            >
              {testConnection.isPending ? (
                <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="mr-2 animate-spin" />
              ) : null}
              {t('caldav.testButton')}
            </Button>
            <Button
              size="sm"
              onClick={handleConnect}
              disabled={isPending || !serverUrl.trim() || !username.trim() || !password.trim()}
            >
              {configure.isPending ? (
                <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="mr-2 animate-spin" />
              ) : null}
              {t('caldav.connectButton')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowForm(false)
                setServerUrl('')
                setUsername('')
                setPassword('')
              }}
              disabled={isPending}
            >
              {t('caldav.cancelButton')}
            </Button>
          </div>
        </div>
      )}

      {/* Connected state */}
      {isConnected && (
        <div className="ml-4 sm:ml-44 space-y-3">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={isPending || isSyncing}
            >
              <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={2} className={`mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              {t('caldav.syncButton')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={isPending}
            >
              {t('caldav.disconnectButton')}
            </Button>
          </div>
          {status?.lastError && (
            <p className="text-xs text-destructive">{status.lastError}</p>
          )}
        </div>
      )}

      {/* Help text */}
      <details className="ml-4 sm:ml-44 text-sm text-muted-foreground">
        <summary className="cursor-pointer hover:text-foreground">{t('caldav.setupInstructions')}</summary>
        <div className="mt-2 space-y-2 text-xs">
          <p>{t('caldav.helpIntro')}</p>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>Nextcloud:</strong> https://cloud.example.com/remote.php/dav</li>
            <li><strong>Radicale:</strong> http://localhost:5232</li>
            <li><strong>Baikal:</strong> https://baikal.example.com/dav.php</li>
            <li><strong>iCloud:</strong> https://caldav.icloud.com (use app-specific password)</li>
          </ul>
          <p>{t('caldav.helpNote')}</p>
        </div>
      </details>
    </div>
  )
}
