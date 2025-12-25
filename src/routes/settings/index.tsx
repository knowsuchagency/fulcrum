import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FilesystemBrowser } from '@/components/ui/filesystem-browser'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { HugeiconsIcon } from '@hugeicons/react'
import { Folder01Icon, RotateLeft01Icon, Tick02Icon, TestTube01Icon, Loading03Icon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import {
  usePort,
  useDefaultGitReposDir,
  useRemoteHost,
  useEditorApp,
  useEditorHost,
  useEditorSshPort,
  useLinearApiKey,
  useGitHubPat,
  useBasicAuthUsername,
  useBasicAuthPassword,
  useUpdateConfig,
  useResetConfig,
  useNotificationSettings,
  useUpdateNotificationSettings,
  useTestNotificationChannel,
  useZAiSettings,
  useUpdateZAiSettings,
  useDeveloperMode,
  useRestartVibora,
  CONFIG_KEYS,
  type EditorApp,
} from '@/hooks/use-config'
import { useLanguageSync } from '@/hooks/use-language-sync'

export const Route = createFileRoute('/settings/')({
  component: SettingsPage,
})

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-lg border border-border bg-card p-4 pt-6">
      <span className="absolute -top-2.5 left-3 bg-card px-2 text-xs font-medium text-muted-foreground">
        {title}
      </span>
      {children}
    </div>
  )
}

function SettingsPage() {
  const { t } = useTranslation('settings')
  const { t: tc } = useTranslation('common')
  const { data: port, isLoading: portLoading } = usePort()
  const { data: defaultGitReposDir, isLoading: reposDirLoading } = useDefaultGitReposDir()
  const { data: remoteHost, isLoading: remoteHostLoading } = useRemoteHost()
  const { data: editorApp, isLoading: editorAppLoading } = useEditorApp()
  const { data: editorHost, isLoading: editorHostLoading } = useEditorHost()
  const { data: editorSshPort, isLoading: editorSshPortLoading } = useEditorSshPort()
  const { data: linearApiKey, isLoading: linearApiKeyLoading } = useLinearApiKey()
  const { data: githubPat, isLoading: githubPatLoading } = useGitHubPat()
  const { data: basicAuthUsername, isLoading: basicAuthUsernameLoading } = useBasicAuthUsername()
  const { data: basicAuthPassword, isLoading: basicAuthPasswordLoading } = useBasicAuthPassword()
  const { data: notificationSettings, isLoading: notificationsLoading } = useNotificationSettings()
  const { data: zAiSettings, isLoading: zAiLoading } = useZAiSettings()
  const { data: developerMode } = useDeveloperMode()
  const restartVibora = useRestartVibora()
  const { savedLanguage, changeLanguage } = useLanguageSync()
  const updateConfig = useUpdateConfig()
  const resetConfig = useResetConfig()
  const updateNotifications = useUpdateNotificationSettings()
  const updateZAi = useUpdateZAiSettings()
  const testChannel = useTestNotificationChannel()

  const [localPort, setLocalPort] = useState('')
  const [localReposDir, setLocalReposDir] = useState('')
  const [localRemoteHost, setLocalRemoteHost] = useState('')
  const [localEditorApp, setLocalEditorApp] = useState<EditorApp>('vscode')
  const [localEditorHost, setLocalEditorHost] = useState('')
  const [localEditorSshPort, setLocalEditorSshPort] = useState('')
  const [localLinearApiKey, setLocalLinearApiKey] = useState('')
  const [localGitHubPat, setLocalGitHubPat] = useState('')
  const [localBasicAuthUsername, setLocalBasicAuthUsername] = useState('')
  const [localBasicAuthPassword, setLocalBasicAuthPassword] = useState('')
  const [reposDirBrowserOpen, setReposDirBrowserOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  // Notification settings local state
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [slackEnabled, setSlackEnabled] = useState(false)
  const [slackWebhook, setSlackWebhook] = useState('')
  const [discordEnabled, setDiscordEnabled] = useState(false)
  const [discordWebhook, setDiscordWebhook] = useState('')
  const [pushoverEnabled, setPushoverEnabled] = useState(false)
  const [pushoverAppToken, setPushoverAppToken] = useState('')
  const [pushoverUserKey, setPushoverUserKey] = useState('')

  // z.ai settings local state
  const [zAiEnabled, setZAiEnabled] = useState(false)
  const [zAiApiKey, setZAiApiKey] = useState('')
  const [zAiHaikuModel, setZAiHaikuModel] = useState('glm-4.5-air')
  const [zAiSonnetModel, setZAiSonnetModel] = useState('glm-4.7')
  const [zAiOpusModel, setZAiOpusModel] = useState('glm-4.7')

  // Developer mode restart state
  const [isRestarting, setIsRestarting] = useState(false)

  // Sync local form state with fetched server values
  useEffect(() => {
    if (port !== undefined) setLocalPort(String(port))
    if (defaultGitReposDir !== undefined) setLocalReposDir(defaultGitReposDir)
    if (remoteHost !== undefined) setLocalRemoteHost(remoteHost)
    if (editorApp !== undefined) setLocalEditorApp(editorApp)
    if (editorHost !== undefined) setLocalEditorHost(editorHost)
    if (editorSshPort !== undefined) setLocalEditorSshPort(String(editorSshPort))
    if (linearApiKey !== undefined) setLocalLinearApiKey(linearApiKey)
    if (githubPat !== undefined) setLocalGitHubPat(githubPat)
    // For username, sync directly. For password, the server returns masked value - only update if empty (not yet loaded)
    if (basicAuthUsername !== undefined) setLocalBasicAuthUsername(basicAuthUsername)
    // Don't sync password from server since it's masked - user must re-enter to change
  }, [port, defaultGitReposDir, remoteHost, editorApp, editorHost, editorSshPort, linearApiKey, githubPat, basicAuthUsername])

  // Sync notification settings
  useEffect(() => {
    if (notificationSettings) {
      setNotificationsEnabled(notificationSettings.enabled)
      setSoundEnabled(notificationSettings.sound?.enabled ?? false)
      setSlackEnabled(notificationSettings.slack?.enabled ?? false)
      setSlackWebhook(notificationSettings.slack?.webhookUrl ?? '')
      setDiscordEnabled(notificationSettings.discord?.enabled ?? false)
      setDiscordWebhook(notificationSettings.discord?.webhookUrl ?? '')
      setPushoverEnabled(notificationSettings.pushover?.enabled ?? false)
      setPushoverAppToken(notificationSettings.pushover?.appToken ?? '')
      setPushoverUserKey(notificationSettings.pushover?.userKey ?? '')
    }
  }, [notificationSettings])

  // Sync z.ai settings
  useEffect(() => {
    if (zAiSettings) {
      setZAiEnabled(zAiSettings.enabled)
      setZAiApiKey(zAiSettings.apiKey ?? '')
      setZAiHaikuModel(zAiSettings.haikuModel)
      setZAiSonnetModel(zAiSettings.sonnetModel)
      setZAiOpusModel(zAiSettings.opusModel)
    }
  }, [zAiSettings])

  const isLoading =
    portLoading || reposDirLoading || remoteHostLoading || editorAppLoading || editorHostLoading || editorSshPortLoading || linearApiKeyLoading || githubPatLoading || basicAuthUsernameLoading || basicAuthPasswordLoading || notificationsLoading || zAiLoading

  const hasZAiChanges = zAiSettings && (
    zAiEnabled !== zAiSettings.enabled ||
    zAiApiKey !== (zAiSettings.apiKey ?? '') ||
    zAiHaikuModel !== zAiSettings.haikuModel ||
    zAiSonnetModel !== zAiSettings.sonnetModel ||
    zAiOpusModel !== zAiSettings.opusModel
  )

  const hasNotificationChanges = notificationSettings && (
    notificationsEnabled !== notificationSettings.enabled ||
    soundEnabled !== (notificationSettings.sound?.enabled ?? false) ||
    slackEnabled !== (notificationSettings.slack?.enabled ?? false) ||
    slackWebhook !== (notificationSettings.slack?.webhookUrl ?? '') ||
    discordEnabled !== (notificationSettings.discord?.enabled ?? false) ||
    discordWebhook !== (notificationSettings.discord?.webhookUrl ?? '') ||
    pushoverEnabled !== (notificationSettings.pushover?.enabled ?? false) ||
    pushoverAppToken !== (notificationSettings.pushover?.appToken ?? '') ||
    pushoverUserKey !== (notificationSettings.pushover?.userKey ?? '')
  )

  // Auth has changes if username differs OR password is non-empty (user wants to update it)
  const hasAuthChanges =
    localBasicAuthUsername !== basicAuthUsername ||
    localBasicAuthPassword !== ''

  const hasEditorChanges =
    localEditorApp !== editorApp ||
    localEditorHost !== editorHost ||
    localEditorSshPort !== String(editorSshPort)

  const hasChanges =
    localPort !== String(port) ||
    localReposDir !== defaultGitReposDir ||
    localRemoteHost !== remoteHost ||
    localLinearApiKey !== linearApiKey ||
    localGitHubPat !== githubPat ||
    hasAuthChanges ||
    hasEditorChanges ||
    hasNotificationChanges ||
    hasZAiChanges

  const handleSaveAll = async () => {
    const promises: Promise<unknown>[] = []

    if (localPort !== String(port)) {
      const portNum = parseInt(localPort, 10)
      if (!isNaN(portNum) && portNum >= 1 && portNum <= 65535) {
        promises.push(
          new Promise((resolve) => {
            updateConfig.mutate({ key: CONFIG_KEYS.PORT, value: portNum }, { onSettled: resolve })
          })
        )
      }
    }

    if (localReposDir !== defaultGitReposDir) {
      promises.push(
        new Promise((resolve) => {
          updateConfig.mutate(
            { key: CONFIG_KEYS.DEFAULT_GIT_REPOS_DIR, value: localReposDir },
            { onSettled: resolve }
          )
        })
      )
    }

    if (localRemoteHost !== remoteHost) {
      promises.push(
        new Promise((resolve) => {
          updateConfig.mutate(
            { key: CONFIG_KEYS.REMOTE_HOST, value: localRemoteHost },
            { onSettled: resolve }
          )
        })
      )
    }

    // Save editor settings
    if (localEditorApp !== editorApp) {
      promises.push(
        new Promise((resolve) => {
          updateConfig.mutate(
            { key: CONFIG_KEYS.EDITOR_APP, value: localEditorApp },
            { onSettled: resolve }
          )
        })
      )
    }

    if (localEditorHost !== editorHost) {
      promises.push(
        new Promise((resolve) => {
          updateConfig.mutate(
            { key: CONFIG_KEYS.EDITOR_HOST, value: localEditorHost },
            { onSettled: resolve }
          )
        })
      )
    }

    if (localEditorSshPort !== String(editorSshPort)) {
      const portNum = parseInt(localEditorSshPort, 10)
      if (!isNaN(portNum) && portNum >= 1 && portNum <= 65535) {
        promises.push(
          new Promise((resolve) => {
            updateConfig.mutate(
              { key: CONFIG_KEYS.EDITOR_SSH_PORT, value: portNum },
              { onSettled: resolve }
            )
          })
        )
      }
    }

    if (localLinearApiKey !== linearApiKey) {
      promises.push(
        new Promise((resolve) => {
          updateConfig.mutate(
            { key: CONFIG_KEYS.LINEAR_API_KEY, value: localLinearApiKey },
            { onSettled: resolve }
          )
        })
      )
    }

    if (localGitHubPat !== githubPat) {
      promises.push(
        new Promise((resolve) => {
          updateConfig.mutate(
            { key: CONFIG_KEYS.GITHUB_PAT, value: localGitHubPat },
            { onSettled: resolve }
          )
        })
      )
    }

    // Save auth settings
    if (localBasicAuthUsername !== basicAuthUsername) {
      promises.push(
        new Promise((resolve) => {
          updateConfig.mutate(
            { key: CONFIG_KEYS.BASIC_AUTH_USERNAME, value: localBasicAuthUsername },
            { onSettled: resolve }
          )
        })
      )
    }

    if (localBasicAuthPassword !== '') {
      promises.push(
        new Promise((resolve) => {
          updateConfig.mutate(
            { key: CONFIG_KEYS.BASIC_AUTH_PASSWORD, value: localBasicAuthPassword },
            { onSettled: resolve }
          )
        })
      )
      // Clear local password after saving
      setLocalBasicAuthPassword('')
    }

    // Save notification settings
    if (hasNotificationChanges) {
      promises.push(
        new Promise((resolve) => {
          updateNotifications.mutate(
            {
              enabled: notificationsEnabled,
              sound: { enabled: soundEnabled },
              slack: { enabled: slackEnabled, webhookUrl: slackWebhook },
              discord: { enabled: discordEnabled, webhookUrl: discordWebhook },
              pushover: { enabled: pushoverEnabled, appToken: pushoverAppToken, userKey: pushoverUserKey },
            },
            { onSettled: resolve }
          )
        })
      )
    }

    // Save z.ai settings
    if (hasZAiChanges) {
      promises.push(
        new Promise((resolve) => {
          updateZAi.mutate(
            {
              enabled: zAiEnabled,
              apiKey: zAiApiKey || null,
              haikuModel: zAiHaikuModel,
              sonnetModel: zAiSonnetModel,
              opusModel: zAiOpusModel,
            },
            { onSettled: resolve }
          )
        })
      )
    }

    await Promise.all(promises)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleResetPort = () => {
    resetConfig.mutate(CONFIG_KEYS.PORT, {
      onSuccess: (data) => {
        if (data.value !== null) setLocalPort(String(data.value))
      },
    })
  }

  const handleResetReposDir = () => {
    resetConfig.mutate(CONFIG_KEYS.DEFAULT_GIT_REPOS_DIR, {
      onSuccess: (data) => {
        if (data.value) setLocalReposDir(String(data.value))
      },
    })
  }

  const handleResetEditorApp = () => {
    resetConfig.mutate(CONFIG_KEYS.EDITOR_APP, {
      onSuccess: (data) => {
        if (data.value !== null && data.value !== undefined)
          setLocalEditorApp(data.value as EditorApp)
      },
    })
  }

  const handleResetEditorHost = () => {
    resetConfig.mutate(CONFIG_KEYS.EDITOR_HOST, {
      onSuccess: (data) => {
        setLocalEditorHost(data.value !== null && data.value !== undefined ? String(data.value) : '')
      },
    })
  }

  const handleResetEditorSshPort = () => {
    resetConfig.mutate(CONFIG_KEYS.EDITOR_SSH_PORT, {
      onSuccess: (data) => {
        if (data.value !== null && data.value !== undefined)
          setLocalEditorSshPort(String(data.value))
      },
    })
  }

  const handleResetLinearApiKey = () => {
    resetConfig.mutate(CONFIG_KEYS.LINEAR_API_KEY, {
      onSuccess: (data) => {
        setLocalLinearApiKey(data.value !== null && data.value !== undefined ? String(data.value) : '')
      },
    })
  }

  const handleResetGitHubPat = () => {
    resetConfig.mutate(CONFIG_KEYS.GITHUB_PAT, {
      onSuccess: (data) => {
        setLocalGitHubPat(data.value !== null && data.value !== undefined ? String(data.value) : '')
      },
    })
  }

  const handleResetBasicAuthUsername = () => {
    resetConfig.mutate(CONFIG_KEYS.BASIC_AUTH_USERNAME, {
      onSuccess: (data) => {
        setLocalBasicAuthUsername(data.value !== null && data.value !== undefined ? String(data.value) : '')
      },
    })
  }

  const handleResetBasicAuthPassword = () => {
    resetConfig.mutate(CONFIG_KEYS.BASIC_AUTH_PASSWORD, {
      onSuccess: () => {
        setLocalBasicAuthPassword('')
      },
    })
  }

  const handleTestChannel = async (channel: 'sound' | 'slack' | 'discord' | 'pushover') => {
    testChannel.mutate(channel, {
      onSuccess: (result) => {
        if (result.success) {
          toast.success(t('notifications.testSuccess', { channel }))
        } else {
          toast.error(t('notifications.testFailed', { channel, error: result.error }))
        }
      },
      onError: (error) => {
        toast.error(t('notifications.testFailed', { channel, error: error.message }))
      },
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <h1 className="text-sm font-medium">{t('title')}</h1>
      </div>

      <div className="pixel-grid flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-5xl space-y-4">
              {/* Server */}
              <SettingsSection title={t('sections.server')}>
                <div className="space-y-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="text-sm text-muted-foreground sm:w-32 sm:shrink-0">{t('fields.port.label')}</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={65535}
                        value={localPort}
                        onChange={(e) => setLocalPort(e.target.value)}
                        placeholder="7777"
                        disabled={isLoading}
                        className="w-24 font-mono text-sm"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={handleResetPort}
                        disabled={isLoading || resetConfig.isPending}
                        title={tc('buttons.reset')}
                      >
                        <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground sm:ml-32 sm:pl-2">
                    {t('fields.port.description')}
                  </p>
                </div>
              </SettingsSection>

              {/* Paths */}
              <SettingsSection title={t('sections.paths')}>
                <div className="space-y-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="text-sm text-muted-foreground sm:w-32 sm:shrink-0">
                      {t('fields.gitReposDir.label')}
                    </label>
                    <div className="flex flex-1 items-center gap-2">
                      <Input
                        value={localReposDir}
                        onChange={(e) => setLocalReposDir(e.target.value)}
                        placeholder="~/projects"
                        disabled={isLoading}
                        className="flex-1 font-mono text-sm"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => setReposDirBrowserOpen(true)}
                        disabled={isLoading}
                        title={tc('buttons.browse')}
                      >
                        <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={2} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={handleResetReposDir}
                        disabled={isLoading || resetConfig.isPending}
                        title={tc('buttons.reset')}
                      >
                        <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground sm:ml-32 sm:pl-2">
                    {t('fields.gitReposDir.description')}
                  </p>
                </div>
              </SettingsSection>

              {/* Authentication */}
              <SettingsSection title={t('sections.authentication')}>
                <div className="space-y-4">
                  {/* Username */}
                  <div className="space-y-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <label className="text-sm text-muted-foreground sm:w-32 sm:shrink-0">
                        {t('fields.auth.username')}
                      </label>
                      <div className="flex flex-1 items-center gap-2">
                        <Input
                          value={localBasicAuthUsername}
                          onChange={(e) => setLocalBasicAuthUsername(e.target.value)}
                          placeholder={t('fields.auth.usernamePlaceholder')}
                          disabled={isLoading}
                          className="flex-1 font-mono text-sm"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={handleResetBasicAuthUsername}
                          disabled={isLoading || resetConfig.isPending}
                          title={tc('buttons.reset')}
                        >
                          <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <label className="text-sm text-muted-foreground sm:w-32 sm:shrink-0">
                        {t('fields.auth.password')}
                      </label>
                      <div className="flex flex-1 items-center gap-2">
                        <Input
                          type="password"
                          value={localBasicAuthPassword}
                          onChange={(e) => setLocalBasicAuthPassword(e.target.value)}
                          placeholder={basicAuthPassword ? t('fields.auth.passwordSet') : t('fields.auth.passwordPlaceholder')}
                          disabled={isLoading}
                          className="flex-1 font-mono text-sm"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={handleResetBasicAuthPassword}
                          disabled={isLoading || resetConfig.isPending}
                          title={tc('buttons.reset')}
                        >
                          <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {t('fields.auth.description')}
                  </p>
                </div>
              </SettingsSection>

              {/* Editor + Integrations side by side */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Editor */}
                <SettingsSection title={t('sections.editor')}>
                  <div className="space-y-4">
                    {/* Editor App */}
                    <div className="space-y-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="text-sm text-muted-foreground sm:w-20 sm:shrink-0">
                          {t('fields.editor.app.label')}
                        </label>
                        <div className="flex items-center gap-2">
                          <Select
                            value={localEditorApp}
                            onValueChange={(v) => setLocalEditorApp(v as EditorApp)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="vscode">VS Code</SelectItem>
                              <SelectItem value="cursor">Cursor</SelectItem>
                              <SelectItem value="windsurf">Windsurf</SelectItem>
                              <SelectItem value="zed">Zed</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={handleResetEditorApp}
                            disabled={isLoading || resetConfig.isPending}
                            title={tc('buttons.reset')}
                          >
                            <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground sm:ml-20 sm:pl-2">
                        {t('fields.editor.app.description')}
                      </p>
                    </div>

                    {/* Editor Host */}
                    <div className="space-y-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="text-sm text-muted-foreground sm:w-20 sm:shrink-0">
                          {t('fields.editor.host.label')}
                        </label>
                        <div className="flex flex-1 items-center gap-2">
                          <Input
                            value={localEditorHost}
                            onChange={(e) => setLocalEditorHost(e.target.value)}
                            placeholder={t('fields.editor.host.placeholder')}
                            disabled={isLoading}
                            className="flex-1 font-mono text-sm"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={handleResetEditorHost}
                            disabled={isLoading || resetConfig.isPending}
                            title={tc('buttons.reset')}
                          >
                            <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground sm:ml-20 sm:pl-2">
                        {t('fields.editor.host.description')}
                      </p>
                    </div>

                    {/* SSH Port */}
                    <div className="space-y-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="text-sm text-muted-foreground sm:w-20 sm:shrink-0">
                          {t('fields.editor.sshPort.label')}
                        </label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={65535}
                            value={localEditorSshPort}
                            onChange={(e) => setLocalEditorSshPort(e.target.value)}
                            placeholder="22"
                            disabled={isLoading}
                            className="w-20 font-mono text-sm"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={handleResetEditorSshPort}
                            disabled={isLoading || resetConfig.isPending}
                            title={tc('buttons.reset')}
                          >
                            <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground sm:ml-20 sm:pl-2">
                        {t('fields.editor.sshPort.description')}
                      </p>
                    </div>
                  </div>
                </SettingsSection>

                {/* Integrations */}
                <SettingsSection title={t('sections.integrations')}>
                  <div className="space-y-4">
                    {/* Linear API Key */}
                    <div className="space-y-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="text-sm text-muted-foreground sm:w-20 sm:shrink-0">
                          {t('fields.linear.label')}
                        </label>
                        <div className="flex flex-1 items-center gap-2">
                          <Input
                            type="password"
                            value={localLinearApiKey}
                            onChange={(e) => setLocalLinearApiKey(e.target.value)}
                            placeholder="lin_api_..."
                            disabled={isLoading}
                            className="flex-1 font-mono text-sm"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={handleResetLinearApiKey}
                            disabled={isLoading || resetConfig.isPending}
                            title={tc('buttons.reset')}
                          >
                            <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground sm:ml-20 sm:pl-2">
                        {t('fields.linear.description')}
                      </p>
                    </div>

                    {/* GitHub PAT */}
                    <div className="space-y-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="text-sm text-muted-foreground sm:w-20 sm:shrink-0">
                          {t('fields.github.label')}
                        </label>
                        <div className="flex flex-1 items-center gap-2">
                          <Input
                            type="password"
                            value={localGitHubPat}
                            onChange={(e) => setLocalGitHubPat(e.target.value)}
                            placeholder="ghp_..."
                            disabled={isLoading}
                            className="flex-1 font-mono text-sm"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={handleResetGitHubPat}
                            disabled={isLoading || resetConfig.isPending}
                            title={tc('buttons.reset')}
                          >
                            <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground sm:ml-20 sm:pl-2">
                        {t('fields.github.description')}
                      </p>
                    </div>
                  </div>
                </SettingsSection>
              </div>

              {/* z.ai */}
              <SettingsSection title={t('sections.zai')}>
                <div className="space-y-4">
                  {/* Enable toggle */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="text-sm text-muted-foreground sm:w-20 sm:shrink-0">
                      {t('fields.zai.enable')}
                    </label>
                    <Switch
                      checked={zAiEnabled}
                      onCheckedChange={setZAiEnabled}
                      disabled={isLoading}
                    />
                  </div>

                  {/* Settings (shown when enabled) */}
                  {zAiEnabled && (
                    <>
                      {/* API Key */}
                      <div className="space-y-1">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <label className="text-sm text-muted-foreground sm:w-20 sm:shrink-0">
                            {t('fields.zai.apiKey')}
                          </label>
                          <Input
                            type="password"
                            value={zAiApiKey}
                            onChange={(e) => setZAiApiKey(e.target.value)}
                            placeholder="zai_..."
                            disabled={isLoading}
                            className="flex-1 font-mono text-sm"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground sm:ml-20 sm:pl-2">
                          {t('fields.zai.description')}
                        </p>
                      </div>

                      {/* Model Mappings */}
                      <div className="space-y-3 border-t border-border pt-4">
                        <p className="text-xs font-medium text-muted-foreground">{t('fields.zai.modelMappings')}</p>

                        {/* Haiku Model */}
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <label className="text-sm text-muted-foreground sm:w-20 sm:shrink-0">
                            {t('fields.zai.haiku')}
                          </label>
                          <Input
                            value={zAiHaikuModel}
                            onChange={(e) => setZAiHaikuModel(e.target.value)}
                            placeholder="glm-4.5-air"
                            disabled={isLoading}
                            className="flex-1 font-mono text-sm"
                          />
                        </div>

                        {/* Sonnet Model */}
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <label className="text-sm text-muted-foreground sm:w-20 sm:shrink-0">
                            {t('fields.zai.sonnet')}
                          </label>
                          <Input
                            value={zAiSonnetModel}
                            onChange={(e) => setZAiSonnetModel(e.target.value)}
                            placeholder="glm-4.7"
                            disabled={isLoading}
                            className="flex-1 font-mono text-sm"
                          />
                        </div>

                        {/* Opus Model */}
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <label className="text-sm text-muted-foreground sm:w-20 sm:shrink-0">
                            {t('fields.zai.opus')}
                          </label>
                          <Input
                            value={zAiOpusModel}
                            onChange={(e) => setZAiOpusModel(e.target.value)}
                            placeholder="glm-4.7"
                            disabled={isLoading}
                            className="flex-1 font-mono text-sm"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </SettingsSection>

              {/* Notifications */}
              <SettingsSection title={t('sections.notifications')}>
                <div className="space-y-4">
                  {/* Master toggle */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="text-sm text-muted-foreground sm:w-40 sm:shrink-0">
                      {t('notifications.enable')}
                    </label>
                    <Switch
                      checked={notificationsEnabled}
                      onCheckedChange={setNotificationsEnabled}
                      disabled={isLoading}
                    />
                  </div>

                  {/* Sound */}
                  <div className="space-y-2 pl-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={soundEnabled}
                        onCheckedChange={setSoundEnabled}
                        disabled={isLoading || !notificationsEnabled}
                      />
                      <label className="text-sm text-muted-foreground">{t('notifications.sound')}</label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => handleTestChannel('sound')}
                        disabled={isLoading || !notificationsEnabled || !soundEnabled || testChannel.isPending}
                        title={t('notifications.sound')}
                      >
                        {testChannel.isPending ? (
                          <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                        ) : (
                          <HugeiconsIcon icon={TestTube01Icon} size={14} strokeWidth={2} />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Slack */}
                  <div className="space-y-2 pl-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={slackEnabled}
                        onCheckedChange={setSlackEnabled}
                        disabled={isLoading || !notificationsEnabled}
                      />
                      <label className="text-sm text-muted-foreground">{t('notifications.slack')}</label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => handleTestChannel('slack')}
                        disabled={isLoading || !notificationsEnabled || !slackEnabled || !slackWebhook || testChannel.isPending}
                        title={t('notifications.slack')}
                      >
                        {testChannel.isPending ? (
                          <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                        ) : (
                          <HugeiconsIcon icon={TestTube01Icon} size={14} strokeWidth={2} />
                        )}
                      </Button>
                    </div>
                    {slackEnabled && (
                      <Input
                        type="password"
                        value={slackWebhook}
                        onChange={(e) => setSlackWebhook(e.target.value)}
                        placeholder="https://hooks.slack.com/services/..."
                        disabled={isLoading || !notificationsEnabled}
                        className="ml-6 flex-1 font-mono text-sm"
                      />
                    )}
                  </div>

                  {/* Discord */}
                  <div className="space-y-2 pl-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={discordEnabled}
                        onCheckedChange={setDiscordEnabled}
                        disabled={isLoading || !notificationsEnabled}
                      />
                      <label className="text-sm text-muted-foreground">{t('notifications.discord')}</label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => handleTestChannel('discord')}
                        disabled={isLoading || !notificationsEnabled || !discordEnabled || !discordWebhook || testChannel.isPending}
                        title={t('notifications.discord')}
                      >
                        {testChannel.isPending ? (
                          <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                        ) : (
                          <HugeiconsIcon icon={TestTube01Icon} size={14} strokeWidth={2} />
                        )}
                      </Button>
                    </div>
                    {discordEnabled && (
                      <Input
                        type="password"
                        value={discordWebhook}
                        onChange={(e) => setDiscordWebhook(e.target.value)}
                        placeholder="https://discord.com/api/webhooks/..."
                        disabled={isLoading || !notificationsEnabled}
                        className="ml-6 flex-1 font-mono text-sm"
                      />
                    )}
                  </div>

                  {/* Pushover */}
                  <div className="space-y-2 pl-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={pushoverEnabled}
                        onCheckedChange={setPushoverEnabled}
                        disabled={isLoading || !notificationsEnabled}
                      />
                      <label className="text-sm text-muted-foreground">{t('notifications.pushover')}</label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => handleTestChannel('pushover')}
                        disabled={isLoading || !notificationsEnabled || !pushoverEnabled || !pushoverAppToken || !pushoverUserKey || testChannel.isPending}
                        title={t('notifications.pushover')}
                      >
                        {testChannel.isPending ? (
                          <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                        ) : (
                          <HugeiconsIcon icon={TestTube01Icon} size={14} strokeWidth={2} />
                        )}
                      </Button>
                    </div>
                    {pushoverEnabled && (
                      <div className="ml-6 space-y-2">
                        <Input
                          type="password"
                          value={pushoverAppToken}
                          onChange={(e) => setPushoverAppToken(e.target.value)}
                          placeholder={t('notifications.appToken')}
                          disabled={isLoading || !notificationsEnabled}
                          className="flex-1 font-mono text-sm"
                        />
                        <Input
                          type="password"
                          value={pushoverUserKey}
                          onChange={(e) => setPushoverUserKey(e.target.value)}
                          placeholder={t('notifications.userKey')}
                          disabled={isLoading || !notificationsEnabled}
                          className="flex-1 font-mono text-sm"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </SettingsSection>

              {/* Appearance */}
              <SettingsSection title={t('sections.appearance')}>
                <div className="space-y-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="text-sm text-muted-foreground sm:w-32 sm:shrink-0">
                      {t('fields.language.label')}
                    </label>
                    <Select
                      value={savedLanguage ?? 'auto'}
                      onValueChange={(v) => changeLanguage(v === 'auto' ? null : (v as 'en' | 'zh'))}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">{t('fields.language.options.auto')}</SelectItem>
                        <SelectItem value="en">{t('fields.language.options.en')}</SelectItem>
                        <SelectItem value="zh">{t('fields.language.options.zh')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground sm:ml-32 sm:pl-2">
                    {t('fields.language.description')}
                  </p>
                </div>
              </SettingsSection>

              {/* Developer (only visible in developer mode) */}
              {developerMode?.enabled && (
                <SettingsSection title={t('sections.developer')}>
                  <div className="space-y-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground">
                          {t('developer.restartDescription')}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Save current server start time to detect actual restart
                          const originalStartTime = developerMode?.startedAt
                          setIsRestarting(true)
                          restartVibora.mutate(undefined, {
                            onSuccess: () => {
                              // Poll until server restarts (new startedAt) or timeout
                              const pollForServer = async () => {
                                const maxAttempts = 120 // 60 seconds max (build can take a while)
                                for (let i = 0; i < maxAttempts; i++) {
                                  await new Promise((r) => setTimeout(r, 500))
                                  try {
                                    const res = await fetch('/api/config/developer-mode')
                                    if (res.ok) {
                                      const data = await res.json()
                                      // Only reload if server actually restarted (new start time)
                                      if (data.startedAt !== originalStartTime) {
                                        window.location.reload()
                                        return
                                      }
                                      // Same start time means build failed, old instance still running
                                    }
                                  } catch {
                                    // Server not ready yet, keep polling
                                  }
                                }
                                // Timeout - build likely failed, show error
                                setIsRestarting(false)
                                toast.error(t('developer.restartFailed'), {
                                  description: t('developer.checkLogs'),
                                })
                              }
                              pollForServer()
                            },
                            onError: (error) => {
                              setIsRestarting(false)
                              toast.error(t('developer.restartFailed'), {
                                description: error.message,
                              })
                            },
                          })
                        }}
                        disabled={restartVibora.isPending || isRestarting}
                        className="shrink-0 gap-2"
                      >
                        {(restartVibora.isPending || isRestarting) && (
                          <HugeiconsIcon
                            icon={Loading03Icon}
                            size={14}
                            strokeWidth={2}
                            className="animate-spin"
                          />
                        )}
                        {isRestarting ? t('developer.restarting') : t('developer.restartButton')}
                      </Button>
                    </div>
                  </div>
                </SettingsSection>
              )}

          {/* Save Button */}
          <div className="flex items-center justify-end gap-2 pt-2">
            {saved && (
              <span className="flex items-center gap-1 text-xs text-emerald-500">
                <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />
                {tc('status.saved')}
              </span>
            )}
            <Button
              size="sm"
              onClick={handleSaveAll}
              disabled={!hasChanges || isLoading || updateConfig.isPending}
            >
              {tc('buttons.save')}
            </Button>
          </div>
        </div>
      </div>

      <FilesystemBrowser
        open={reposDirBrowserOpen}
        onOpenChange={setReposDirBrowserOpen}
        onSelect={(path) => setLocalReposDir(path)}
        initialPath={localReposDir || undefined}
      />
    </div>
  )
}
