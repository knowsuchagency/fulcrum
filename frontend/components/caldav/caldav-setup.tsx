/**
 * CalDAV Setup Component - Server config, Google OAuth, connection test, sync controls
 */

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon, Tick02Icon, RefreshIcon } from '@hugeicons/core-free-icons'
import {
  useCaldavStatus,
  useTestCaldavConnection,
  useConfigureCaldav,
  useConfigureGoogleCaldav,
  useGetGoogleAuthUrl,
  useEnableCaldav,
  useDisableCaldav,
  useSyncCaldav,
} from '@/hooks/use-caldav'
import { useConfig, useUpdateConfig, usePort } from '@/hooks/use-config'

interface CaldavSetupProps {
  isLoading?: boolean
}

export function CaldavSetup({ isLoading = false }: CaldavSetupProps) {
  const { t } = useTranslation('settings')
  const { data: status, refetch: refetchStatus } = useCaldavStatus()
  const testConnection = useTestCaldavConnection()
  const configure = useConfigureCaldav()
  const configureGoogle = useConfigureGoogleCaldav()
  const getAuthUrl = useGetGoogleAuthUrl()
  const enable = useEnableCaldav()
  const disable = useDisableCaldav()
  const sync = useSyncCaldav()
  const updateConfig = useUpdateConfig()
  const backendPort = usePort()

  // Read current settings to detect if credentials exist
  const { data: serverUrlConfig } = useConfig('caldav.serverUrl')
  const { data: authTypeConfig } = useConfig('caldav.authType')
  const { data: usernameConfig } = useConfig('caldav.username')
  const { data: oauthTokensConfig } = useConfig('caldav.oauthTokens')
  const authType = (authTypeConfig?.value as string) || 'google-oauth'
  // Credentials exist only if we have actual auth: OAuth tokens for Google, or username for basic
  const hasCredentials = authType === 'google-oauth'
    ? !!(oauthTokensConfig?.value)
    : !!(serverUrlConfig?.value && usernameConfig?.value)

  const [showForm, setShowForm] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('google')

  // Basic auth fields
  const [serverUrl, setServerUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [syncInterval, setSyncInterval] = useState('15')

  // Google OAuth fields
  const [googleClientId, setGoogleClientId] = useState('')
  const [googleClientSecret, setGoogleClientSecret] = useState('')
  const [googleSyncInterval, setGoogleSyncInterval] = useState('15')
  const [isPollingForConnect, setIsPollingForConnect] = useState(false)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isConnected = status?.connected === true
  const isSyncing = status?.syncing === true

  // Poll for connection status after Google OAuth flow
  useEffect(() => {
    if (isPollingForConnect && !isConnected) {
      pollIntervalRef.current = setInterval(() => {
        refetchStatus()
      }, 2000)
    }

    if (isConnected && isPollingForConnect) {
      setIsPollingForConnect(false)
      setShowForm(false)
      setGoogleClientId('')
      setGoogleClientSecret('')
      toast.success(t('caldav.configured'))
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [isPollingForConnect, isConnected, refetchStatus, t])

  // Set initial tab based on current auth type
  useEffect(() => {
    if (authType === 'google-oauth') {
      setActiveTab('google')
    }
  }, [authType])

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
        setIsPollingForConnect(false)
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

  const handleGoogleConnect = async () => {
    if (!googleClientId.trim() || !googleClientSecret.trim()) {
      toast.error(t('caldav.googleFillRequired'))
      return
    }

    try {
      // Save credentials first
      await configureGoogle.mutateAsync({
        googleClientId: googleClientId.trim(),
        googleClientSecret: googleClientSecret.trim(),
        syncIntervalMinutes: parseInt(googleSyncInterval, 10) || 15,
      })

      // Get authorization URL
      const { authUrl } = await getAuthUrl.mutateAsync()

      // Open in new window
      window.open(authUrl, '_blank', 'noopener')
      toast.info(t('caldav.googleAuthStarted'))

      // Start polling for connection
      setIsPollingForConnect(true)
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
      // Clear all credentials (basic + OAuth)
      await updateConfig.mutateAsync({ key: 'caldav.serverUrl', value: '' })
      await updateConfig.mutateAsync({ key: 'caldav.username', value: '' })
      await updateConfig.mutateAsync({ key: 'caldav.password', value: '' })
      await updateConfig.mutateAsync({ key: 'caldav.authType', value: 'google-oauth' })
      await updateConfig.mutateAsync({ key: 'caldav.googleClientId', value: '' })
      await updateConfig.mutateAsync({ key: 'caldav.googleClientSecret', value: '' })
      await updateConfig.mutateAsync({ key: 'caldav.oauthTokens', value: null })
      toast.success(t('caldav.disconnected'))
      refetchStatus()
    } catch {
      toast.error(t('caldav.disconnectFailed'))
    }
  }

  const isPending =
    configure.isPending ||
    configureGoogle.isPending ||
    getAuthUrl.isPending ||
    enable.isPending ||
    disable.isPending ||
    testConnection.isPending ||
    sync.isPending

  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="text-sm text-muted-foreground sm:w-40 sm:shrink-0">
          {t('caldav.label')}
        </label>
        <div className="flex items-center gap-3">
          <Switch
            checked={isConnected || showForm}
            onCheckedChange={handleToggle}
            disabled={isLoading || isPending}
          />
          {isConnected && (
            <span className="flex items-center gap-2 text-sm">
              {isSyncing ? (
                <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin text-yellow-500" />
              ) : (
                <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} className="text-green-500" />
              )}
              <span className="text-muted-foreground">
                {isSyncing ? t('caldav.statusSyncing') : t('caldav.statusConnected', { count: status?.calendarCount ?? 0 })}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Configuration form with tabs */}
      {showForm && !isConnected && (
        <div className="ml-4 sm:ml-44">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="google">{t('caldav.tabGoogle')}</TabsTrigger>
              <TabsTrigger value="basic">{t('caldav.tabBasic')}</TabsTrigger>
            </TabsList>

            {/* Basic CalDAV tab */}
            <TabsContent value="basic">
              <div className="space-y-3 pt-2">
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
            </TabsContent>

            {/* Google Calendar tab */}
            <TabsContent value="google">
              <div className="space-y-3 pt-2">
                <div className="space-y-2">
                  <label className="block text-xs text-muted-foreground">{t('caldav.googleClientId')}</label>
                  <Input
                    type="text"
                    placeholder={t('caldav.googleClientIdPlaceholder')}
                    value={googleClientId}
                    onChange={(e) => setGoogleClientId(e.target.value)}
                    className="max-w-md font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs text-muted-foreground">{t('caldav.googleClientSecret')}</label>
                  <Input
                    type="password"
                    placeholder={t('caldav.googleClientSecretPlaceholder')}
                    value={googleClientSecret}
                    onChange={(e) => setGoogleClientSecret(e.target.value)}
                    className="max-w-md font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs text-muted-foreground">{t('caldav.syncInterval')}</label>
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={googleSyncInterval}
                    onChange={(e) => setGoogleSyncInterval(e.target.value)}
                    className="w-24 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleGoogleConnect}
                    disabled={isPending || isPollingForConnect || !googleClientId.trim() || !googleClientSecret.trim()}
                  >
                    {(configureGoogle.isPending || getAuthUrl.isPending || isPollingForConnect) ? (
                      <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="mr-2 animate-spin" />
                    ) : null}
                    {t('caldav.connectGoogleButton')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowForm(false)
                      setIsPollingForConnect(false)
                      setGoogleClientId('')
                      setGoogleClientSecret('')
                    }}
                    disabled={isPending}
                  >
                    {t('caldav.cancelButton')}
                  </Button>
                </div>
                <details className="text-xs text-muted-foreground max-w-lg">
                  <summary className="cursor-pointer hover:text-foreground font-medium">
                    {t('caldav.googleSetupHelp')}
                  </summary>
                  <ol className="mt-2 space-y-1.5 list-none pl-0">
                    <li>{t('caldav.googleStep1')}</li>
                    <li>{t('caldav.googleStep2')}</li>
                    <li>{t('caldav.googleStep3')}</li>
                    <li>{t('caldav.googleStep4')}</li>
                    <li>{t('caldav.googleStep5')}</li>
                    <li className="pl-4 font-mono text-[11px] bg-muted/50 rounded px-2 py-1 w-fit">
                      {t('caldav.googleCallbackNote', { callbackUrl: `http://${window.location.hostname}:${backendPort.data}/api/caldav/oauth/callback` })}
                    </li>
                    <li>{t('caldav.googleStep6')}</li>
                  </ol>
                </details>
              </div>
            </TabsContent>
          </Tabs>
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
            <li><strong>Google:</strong> Use the Google Calendar tab with OAuth2</li>
          </ul>
          <p>{t('caldav.helpNote')}</p>
        </div>
      </details>
    </div>
  )
}
