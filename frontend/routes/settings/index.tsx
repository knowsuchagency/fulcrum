import { useState, useEffect, useRef } from 'react'
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { HugeiconsIcon } from '@hugeicons/react'
import { Folder01Icon, RotateLeft01Icon, Tick02Icon, TestTube01Icon, Loading03Icon, Upload04Icon, Delete02Icon, ArrowDown01Icon, Alert02Icon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import {
  usePort,
  useDefaultGitReposDir,
  useEditorApp,
  useEditorHost,
  useEditorSshPort,
  useLinearApiKey,
  useGitHubPat,
  useDefaultAgent,
  useOpencodeModel,
  useOpencodeDefaultAgent,
  useOpencodePlanAgent,
  useUpdateConfig,
  useResetConfig,
  useNotificationSettings,
  useUpdateNotificationSettings,
  useTestNotificationChannel,
  useZAiSettings,
  useUpdateZAiSettings,
  useDeveloperMode,
  useRestartVibora,
  useClaudeCodeLightTheme,
  useClaudeCodeDarkTheme,
  useViboraVersion,
  NotificationSettingsConflictError,
  CONFIG_KEYS,
  CLAUDE_CODE_THEMES,
  type EditorApp,
  type ClaudeCodeTheme,
} from '@/hooks/use-config'
import { useQueryClient } from '@tanstack/react-query'
import { AGENT_DISPLAY_NAMES, type AgentType } from '@/types'
import { ModelPicker } from '@/components/opencode/model-picker'
import {
  useDeploymentSettings,
  useUpdateDeploymentSettings,
} from '@/hooks/use-apps'
import { useLanguageSync } from '@/hooks/use-language-sync'
import { useThemeSync } from '@/hooks/use-theme-sync'

export const Route = createFileRoute('/settings/')({
  component: SettingsPage,
})

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-lg border border-border bg-card p-4 pt-6">
      <span className="absolute -top-2.5 left-3 rounded bg-card px-2 text-xs font-medium text-muted-foreground">
        {title}
      </span>
      {children}
    </div>
  )
}

function SettingsPage() {
  const { t } = useTranslation('settings')
  const { t: tc } = useTranslation('common')
  const isDesktop = typeof window !== 'undefined' && window.parent !== window
  const { data: port, isLoading: portLoading } = usePort()
  const { data: defaultGitReposDir, isLoading: reposDirLoading } = useDefaultGitReposDir()
  const { data: editorApp, isLoading: editorAppLoading } = useEditorApp()
  const { data: editorHost, isLoading: editorHostLoading } = useEditorHost()
  const { data: editorSshPort, isLoading: editorSshPortLoading } = useEditorSshPort()
  const { data: linearApiKey, isLoading: linearApiKeyLoading } = useLinearApiKey()
  const { data: githubPat, isLoading: githubPatLoading } = useGitHubPat()
  const { data: defaultAgent, isLoading: defaultAgentLoading } = useDefaultAgent()
  const { data: globalOpencodeModel, isLoading: opcodeModelLoading } = useOpencodeModel()
  const { data: globalOpencodeDefaultAgent, isLoading: opcodeDefaultAgentLoading } = useOpencodeDefaultAgent()
  const { data: globalOpencodePlanAgent, isLoading: opencodePlanAgentLoading } = useOpencodePlanAgent()
  const { data: notificationSettings, isLoading: notificationsLoading } = useNotificationSettings()
  const { data: zAiSettings, isLoading: zAiLoading } = useZAiSettings()
  const { data: deploymentSettings, isLoading: deploymentLoading } = useDeploymentSettings()
  const updateDeploymentSettings = useUpdateDeploymentSettings()
  const { data: developerMode } = useDeveloperMode()
  const restartVibora = useRestartVibora()
  const { savedLanguage, changeLanguage } = useLanguageSync()
  const { theme, syncClaudeCode, changeTheme } = useThemeSync()
  const { data: claudeCodeLightTheme } = useClaudeCodeLightTheme()
  const { data: claudeCodeDarkTheme } = useClaudeCodeDarkTheme()
  const { version } = useViboraVersion()
  const updateConfig = useUpdateConfig()
  const resetConfig = useResetConfig()
  const updateNotifications = useUpdateNotificationSettings()
  const updateZAi = useUpdateZAiSettings()
  const testChannel = useTestNotificationChannel()
  const queryClient = useQueryClient()

  const [localPort, setLocalPort] = useState('')
  const [localReposDir, setLocalReposDir] = useState('')
  const [localEditorApp, setLocalEditorApp] = useState<EditorApp>('vscode')
  const [localEditorHost, setLocalEditorHost] = useState('')
  const [localEditorSshPort, setLocalEditorSshPort] = useState('')
  const [localLinearApiKey, setLocalLinearApiKey] = useState('')
  const [localGitHubPat, setLocalGitHubPat] = useState('')
  const [localDefaultAgent, setLocalDefaultAgent] = useState<AgentType>('claude')
  const [localOpencodeModel, setLocalOpencodeModel] = useState<string | null>(null)
  const [localOpencodeDefaultAgent, setLocalOpencodeDefaultAgent] = useState<string>('build')
  const [localOpencodePlanAgent, setLocalOpencodePlanAgent] = useState<string>('plan')
  const [reposDirBrowserOpen, setReposDirBrowserOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  // Notification settings local state
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [toastEnabled, setToastEnabled] = useState(true)
  const [desktopEnabled, setDesktopEnabled] = useState(true)
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

  // Deployment settings local state
  const [localCloudflareToken, setLocalCloudflareToken] = useState('')
  const [localCloudflareAccountId, setLocalCloudflareAccountId] = useState('')

  // Claude Code theme sync local state
  const [localSyncClaudeCode, setLocalSyncClaudeCode] = useState(false)
  const [localClaudeCodeLightTheme, setLocalClaudeCodeLightTheme] = useState<ClaudeCodeTheme>('light-ansi')
  const [localClaudeCodeDarkTheme, setLocalClaudeCodeDarkTheme] = useState<ClaudeCodeTheme>('dark-ansi')

  // Developer mode restart state
  const [isRestarting, setIsRestarting] = useState(false)

  // Custom sound upload state
  const [hasCustomSound, setHasCustomSound] = useState(false)
  const [isUploadingSound, setIsUploadingSound] = useState(false)
  const soundInputRef = useRef<HTMLInputElement>(null)

  // Sync local form state with fetched server values
  useEffect(() => {
    if (port !== undefined) setLocalPort(String(port))
    if (defaultGitReposDir !== undefined) setLocalReposDir(defaultGitReposDir)
    if (editorApp !== undefined) setLocalEditorApp(editorApp)
    if (editorHost !== undefined) setLocalEditorHost(editorHost)
    if (editorSshPort !== undefined) setLocalEditorSshPort(String(editorSshPort))
    if (linearApiKey !== undefined) setLocalLinearApiKey(linearApiKey)
    if (githubPat !== undefined) setLocalGitHubPat(githubPat)
    if (defaultAgent !== undefined) setLocalDefaultAgent(defaultAgent)
    if (globalOpencodeModel !== undefined) setLocalOpencodeModel(globalOpencodeModel)
    if (globalOpencodeDefaultAgent !== undefined) setLocalOpencodeDefaultAgent(globalOpencodeDefaultAgent)
    if (globalOpencodePlanAgent !== undefined) setLocalOpencodePlanAgent(globalOpencodePlanAgent)
  }, [port, defaultGitReposDir, editorApp, editorHost, editorSshPort, linearApiKey, githubPat, defaultAgent, globalOpencodeModel, globalOpencodeDefaultAgent, globalOpencodePlanAgent])

  // Sync notification settings
  useEffect(() => {
    if (notificationSettings) {
      setNotificationsEnabled(notificationSettings.enabled)
      setToastEnabled(notificationSettings.toast?.enabled ?? true)
      setDesktopEnabled(notificationSettings.desktop?.enabled ?? true)
      setSoundEnabled(notificationSettings.sound?.enabled ?? false)
      setHasCustomSound(!!notificationSettings.sound?.customSoundFile)
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

  // Sync deployment settings
  // We sync masked values for display (just like Linear/GitHub fields)
  // The save logic filters out masked values to prevent overwriting real values
  useEffect(() => {
    if (deploymentSettings?.cloudflareApiToken !== undefined) {
      setLocalCloudflareToken(deploymentSettings.cloudflareApiToken ?? '')
    }
    if (deploymentSettings?.cloudflareAccountId !== undefined) {
      setLocalCloudflareAccountId(deploymentSettings.cloudflareAccountId ?? '')
    }
  }, [deploymentSettings])

  // Sync Claude Code theme settings
  useEffect(() => {
    if (syncClaudeCode !== undefined) setLocalSyncClaudeCode(syncClaudeCode)
    if (claudeCodeLightTheme !== undefined) setLocalClaudeCodeLightTheme(claudeCodeLightTheme)
    if (claudeCodeDarkTheme !== undefined) setLocalClaudeCodeDarkTheme(claudeCodeDarkTheme)
  }, [syncClaudeCode, claudeCodeLightTheme, claudeCodeDarkTheme])

  const isLoading =
    portLoading || reposDirLoading || editorAppLoading || editorHostLoading || editorSshPortLoading || linearApiKeyLoading || githubPatLoading || defaultAgentLoading || opcodeModelLoading || opcodeDefaultAgentLoading || opencodePlanAgentLoading || notificationsLoading || zAiLoading || deploymentLoading

  const hasZAiChanges = zAiSettings && (
    zAiEnabled !== zAiSettings.enabled ||
    zAiApiKey !== (zAiSettings.apiKey ?? '') ||
    zAiHaikuModel !== zAiSettings.haikuModel ||
    zAiSonnetModel !== zAiSettings.sonnetModel ||
    zAiOpusModel !== zAiSettings.opusModel
  )

  const hasClaudeCodeChanges =
    localSyncClaudeCode !== (syncClaudeCode ?? false) ||
    localClaudeCodeLightTheme !== claudeCodeLightTheme ||
    localClaudeCodeDarkTheme !== claudeCodeDarkTheme

  // Check if deployment settings have changed
  // We compare local state against server values
  // Masked values (all dots) are treated as "unchanged from server"
  const hasDeploymentChanges = (() => {
    const serverToken = deploymentSettings?.cloudflareApiToken ?? ''
    const serverAccountId = deploymentSettings?.cloudflareAccountId ?? ''
    // Token: changed if different from server AND not a mask (user entered real value)
    const tokenChanged = localCloudflareToken !== serverToken && !localCloudflareToken.match(/^•+$/)
    // Account ID: changed if different from server AND not a mask
    const accountIdChanged = localCloudflareAccountId !== serverAccountId && !localCloudflareAccountId.match(/^•+$/)
    return tokenChanged || accountIdChanged
  })()

  const hasNotificationChanges = notificationSettings && (
    notificationsEnabled !== notificationSettings.enabled ||
    toastEnabled !== (notificationSettings.toast?.enabled ?? true) ||
    desktopEnabled !== (notificationSettings.desktop?.enabled ?? true) ||
    soundEnabled !== (notificationSettings.sound?.enabled ?? false) ||
    slackEnabled !== (notificationSettings.slack?.enabled ?? false) ||
    slackWebhook !== (notificationSettings.slack?.webhookUrl ?? '') ||
    discordEnabled !== (notificationSettings.discord?.enabled ?? false) ||
    discordWebhook !== (notificationSettings.discord?.webhookUrl ?? '') ||
    pushoverEnabled !== (notificationSettings.pushover?.enabled ?? false) ||
    pushoverAppToken !== (notificationSettings.pushover?.appToken ?? '') ||
    pushoverUserKey !== (notificationSettings.pushover?.userKey ?? '')
  )

  const hasEditorChanges =
    localEditorApp !== editorApp ||
    localEditorHost !== editorHost ||
    localEditorSshPort !== String(editorSshPort)

  const hasAgentChanges = localDefaultAgent !== defaultAgent || 
    localOpencodeModel !== (globalOpencodeModel ?? null) ||
    localOpencodeDefaultAgent !== globalOpencodeDefaultAgent ||
    localOpencodePlanAgent !== globalOpencodePlanAgent

  const hasChanges =
    localPort !== String(port) ||
    localReposDir !== defaultGitReposDir ||
    localLinearApiKey !== linearApiKey ||
    localGitHubPat !== githubPat ||
    hasAgentChanges ||
    hasEditorChanges ||
    hasNotificationChanges ||
    hasZAiChanges ||
    hasClaudeCodeChanges ||
    hasDeploymentChanges

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

    // Save agent settings
    if (localDefaultAgent !== defaultAgent) {
      promises.push(
        new Promise((resolve) => {
          updateConfig.mutate(
            { key: CONFIG_KEYS.DEFAULT_AGENT, value: localDefaultAgent },
            { onSettled: resolve }
          )
        })
      )
    }

    if (localOpencodeModel !== (globalOpencodeModel ?? null)) {
      promises.push(
        new Promise((resolve) => {
          updateConfig.mutate(
            { key: CONFIG_KEYS.OPENCODE_MODEL, value: localOpencodeModel },
            { onSettled: resolve }
          )
        })
      )
    }

    if (localOpencodeDefaultAgent !== globalOpencodeDefaultAgent) {
      promises.push(
        new Promise((resolve) => {
          updateConfig.mutate(
            { key: CONFIG_KEYS.OPENCODE_DEFAULT_AGENT, value: localOpencodeDefaultAgent },
            { onSettled: resolve }
          )
        })
      )
    }

    if (localOpencodePlanAgent !== globalOpencodePlanAgent) {
      promises.push(
        new Promise((resolve) => {
          updateConfig.mutate(
            { key: CONFIG_KEYS.OPENCODE_PLAN_AGENT, value: localOpencodePlanAgent },
            { onSettled: resolve }
          )
        })
      )
    }

    // Save notification settings with optimistic locking
    if (hasNotificationChanges) {
      promises.push(
        new Promise((resolve) => {
          updateNotifications.mutate(
            {
              enabled: notificationsEnabled,
              toast: { enabled: toastEnabled },
              desktop: { enabled: desktopEnabled },
              sound: { enabled: soundEnabled },
              slack: { enabled: slackEnabled, webhookUrl: slackWebhook },
              discord: { enabled: discordEnabled, webhookUrl: discordWebhook },
              pushover: { enabled: pushoverEnabled, appToken: pushoverAppToken, userKey: pushoverUserKey },
              _updatedAt: notificationSettings?._updatedAt, // Include timestamp for conflict detection
            },
            {
              onSettled: resolve,
              onError: (error) => {
                if (error instanceof NotificationSettingsConflictError) {
                  // Another tab/device changed the settings - refresh to get current state
                  toast.warning(t('notifications.conflictWarning') || 'Settings changed elsewhere - refreshing')
                  queryClient.invalidateQueries({ queryKey: ['config', 'notifications'] })
                }
              },
            }
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

    // Save Claude Code theme settings
    if (hasClaudeCodeChanges) {
      if (localSyncClaudeCode !== (syncClaudeCode ?? false)) {
        promises.push(
          new Promise((resolve) => {
            updateConfig.mutate(
              { key: CONFIG_KEYS.SYNC_CLAUDE_CODE_THEME, value: localSyncClaudeCode },
              { onSettled: resolve }
            )
          })
        )
      }
      if (localClaudeCodeLightTheme !== claudeCodeLightTheme) {
        promises.push(
          new Promise((resolve) => {
            updateConfig.mutate(
              { key: CONFIG_KEYS.CLAUDE_CODE_LIGHT_THEME, value: localClaudeCodeLightTheme },
              { onSettled: resolve }
            )
          })
        )
      }
      if (localClaudeCodeDarkTheme !== claudeCodeDarkTheme) {
        promises.push(
          new Promise((resolve) => {
            updateConfig.mutate(
              { key: CONFIG_KEYS.CLAUDE_CODE_DARK_THEME, value: localClaudeCodeDarkTheme },
              { onSettled: resolve }
            )
          })
        )
      }
    }

    // Save deployment settings (cloudflare token/account ID)
    // Only send values that were actually changed by the user (not masked placeholders)
    if (hasDeploymentChanges) {
      const serverToken = deploymentSettings?.cloudflareApiToken ?? ''
      const serverAccountId = deploymentSettings?.cloudflareAccountId ?? ''
      const updates: { cloudflareApiToken?: string | null; cloudflareAccountId?: string | null } = {}

      // Only send token if it changed and is not a mask (user entered real value)
      if (localCloudflareToken !== serverToken && !localCloudflareToken.match(/^•+$/)) {
        updates.cloudflareApiToken = localCloudflareToken || null
      }

      // Only send account ID if it changed and is not a mask
      if (localCloudflareAccountId !== serverAccountId && !localCloudflareAccountId.match(/^•+$/)) {
        updates.cloudflareAccountId = localCloudflareAccountId || null
      }

      if (Object.keys(updates).length > 0) {
        promises.push(
          new Promise((resolve) => {
            updateDeploymentSettings.mutate(updates, { onSettled: resolve })
          })
        )
      }
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

  const handleResetDefaultAgent = () => {
    resetConfig.mutate(CONFIG_KEYS.DEFAULT_AGENT, {
      onSuccess: (data) => {
        setLocalDefaultAgent((data.value as AgentType) ?? 'claude')
      },
    })
  }

  const handleResetOpencodeModel = () => {
    resetConfig.mutate(CONFIG_KEYS.OPENCODE_MODEL, {
      onSuccess: (data) => {
        setLocalOpencodeModel(data.value !== null && data.value !== undefined ? String(data.value) : null)
      },
    })
  }

  const handleResetOpencodeDefaultAgent = () => {
    resetConfig.mutate(CONFIG_KEYS.OPENCODE_DEFAULT_AGENT, {
      onSuccess: (data) => {
        setLocalOpencodeDefaultAgent((data.value as string) ?? 'build')
      },
    })
  }

  const handleResetOpencodePlanAgent = () => {
    resetConfig.mutate(CONFIG_KEYS.OPENCODE_PLAN_AGENT, {
      onSuccess: (data) => {
        setLocalOpencodePlanAgent((data.value as string) ?? 'plan')
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

  const handleSoundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingSound(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/uploads/sound', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Upload failed')
      }

      setHasCustomSound(true)
      toast.success(t('notifications.soundUploaded'))
    } catch (err) {
      toast.error(t('notifications.soundUploadFailed', { error: err instanceof Error ? err.message : 'Unknown error' }))
    } finally {
      setIsUploadingSound(false)
      // Reset input so same file can be uploaded again
      if (soundInputRef.current) {
        soundInputRef.current.value = ''
      }
    }
  }

  const handleDeleteCustomSound = async () => {
    try {
      const res = await fetch('/api/uploads/sound', { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setHasCustomSound(false)
      toast.success(t('notifications.soundDeleted'))
    } catch {
      toast.error(t('notifications.soundDeleteFailed'))
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-background px-4 py-2">
        <h1 className="text-sm font-medium">{t('title')}</h1>
        {version && <span className="text-xs text-muted-foreground">v{version}</span>}
      </div>

      <div className="flex-1 overflow-auto p-6">
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
                              <SelectItem value="antigravity">Antigravity</SelectItem>
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
                          <div className="relative flex-1">
                            <Input
                              type="password"
                              value={localLinearApiKey}
                              onChange={(e) => setLocalLinearApiKey(e.target.value)}
                              placeholder="lin_api_..."
                              disabled={isLoading}
                              className="flex-1 pr-8 font-mono text-sm"
                            />
                            {!!linearApiKey && (
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500">
                                <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />
                              </div>
                            )}
                          </div>
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
                          <div className="relative flex-1">
                            <Input
                              type="password"
                              value={localGitHubPat}
                              onChange={(e) => setLocalGitHubPat(e.target.value)}
                              placeholder="ghp_..."
                              disabled={isLoading}
                              className="flex-1 pr-8 font-mono text-sm"
                            />
                            {!!githubPat && (
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500">
                                <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />
                              </div>
                            )}
                          </div>
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

                    {/* Cloudflare API Token */}
                    <div className="space-y-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="text-sm text-muted-foreground sm:w-20 sm:shrink-0">
                          {t('fields.cloudflare.label')}
                        </label>
                        <div className="flex flex-1 items-center gap-2">
                          <div className="relative flex-1">
                            <Input
                              type="password"
                              value={localCloudflareToken}
                              onChange={(e) => setLocalCloudflareToken(e.target.value)}
                              placeholder={t('fields.cloudflare.placeholder')}
                              disabled={isLoading}
                              className="flex-1 pr-8 font-mono text-sm"
                            />
                            {!!deploymentSettings?.cloudflareApiToken && (
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500">
                                <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground sm:ml-20 sm:pl-2">
                        {t('fields.cloudflare.description')}
                      </p>
                    </div>

                    {/* Cloudflare Account ID */}
                    <div className="space-y-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="text-sm text-muted-foreground sm:w-20 sm:shrink-0">
                          Account ID
                        </label>
                        <div className="flex flex-1 items-center gap-2">
                          <div className="relative flex-1">
                            <Input
                              type="password"
                              value={localCloudflareAccountId}
                              onChange={(e) => setLocalCloudflareAccountId(e.target.value)}
                              placeholder="CF Account ID"
                              disabled={isLoading}
                              className="flex-1 pr-8 font-mono text-sm"
                            />
                            {!!deploymentSettings?.cloudflareAccountId && (
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500">
                                <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground sm:ml-20 sm:pl-2">
                        Required for Cloudflare Tunnel. Find in your dashboard URL: dash.cloudflare.com/{'<account_id>'}/...
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
                          <div className="relative flex-1">
                            <Input
                              type="password"
                              value={zAiApiKey}
                              onChange={(e) => setZAiApiKey(e.target.value)}
                              placeholder="zai_..."
                              disabled={isLoading}
                              className="flex-1 pr-8 font-mono text-sm"
                            />
                            {!!zAiSettings?.apiKey && (
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500">
                                <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />
                              </div>
                            )}
                          </div>
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

              {/* Agent */}
              <SettingsSection title={t('sections.agent')}>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <label className="text-sm text-muted-foreground sm:w-32 sm:shrink-0">
                        {t('fields.agent.default.label')}
                      </label>
                      <div className="flex items-center gap-2">
                        <Select
                          value={localDefaultAgent}
                          onValueChange={(v) => setLocalDefaultAgent(v as AgentType)}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(AGENT_DISPLAY_NAMES) as AgentType[]).map((agent) => (
                              <SelectItem key={agent} value={agent}>
                                {AGENT_DISPLAY_NAMES[agent]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={handleResetDefaultAgent}
                          disabled={isLoading || resetConfig.isPending}
                          title={tc('buttons.reset')}
                        >
                          <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground sm:ml-32 sm:pl-2">
                      {t('fields.agent.default.description')}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <label className="text-sm text-muted-foreground sm:w-32 sm:shrink-0">
                        {t('fields.agent.opencodeModel.label')}
                      </label>
                      <div className="flex flex-1 items-center gap-2">
                        <ModelPicker
                          value={localOpencodeModel}
                          onChange={setLocalOpencodeModel}
                          placeholder={t('fields.agent.opencodeModel.placeholder')}
                          className="w-64"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={handleResetOpencodeModel}
                          disabled={isLoading || resetConfig.isPending}
                          title={tc('buttons.reset')}
                        >
                          <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground sm:ml-32 sm:pl-2">
                      {t('fields.agent.opencodeModel.description')}
                    </p>
                  </div>
                </div>

                {/* OpenCode Agent Names - Advanced (collapsed by default) */}
                <Collapsible className="mt-4 space-y-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <CollapsibleTrigger className="group flex cursor-pointer items-center gap-1.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground sm:w-32 sm:shrink-0">
                      <HugeiconsIcon
                        icon={ArrowDown01Icon}
                        size={12}
                        strokeWidth={2}
                        className="shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
                      />
                      <span>{t('fields.agent.advancedAgentNames.label')}</span>
                    </CollapsibleTrigger>
                    <p className="text-xs text-muted-foreground sm:pt-0.5">
                      {t('fields.agent.advancedAgentNames.description')}
                    </p>
                  </div>

                  <CollapsibleContent className="space-y-4 pt-2 sm:ml-32 sm:pl-2">
                    <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-3">
                      <HugeiconsIcon
                        icon={Alert02Icon}
                        size={16}
                        strokeWidth={2}
                        className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                      />
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {t('fields.agent.advancedAgentNames.warning')}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="text-sm text-muted-foreground sm:w-32 sm:shrink-0">
                          {t('fields.agent.opencodeDefaultAgent.label')}
                        </label>
                        <div className="flex flex-1 items-center gap-2">
                          <Input
                            value={localOpencodeDefaultAgent ?? 'build'}
                            onChange={(e) => setLocalOpencodeDefaultAgent(e.target.value)}
                            placeholder="build"
                            disabled={isLoading}
                            className="font-mono text-sm"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={handleResetOpencodeDefaultAgent}
                            disabled={isLoading || resetConfig.isPending}
                            title={tc('buttons.reset')}
                          >
                            <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground sm:ml-32 sm:pl-2">
                        {t('fields.agent.opencodeDefaultAgent.description')}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="text-sm text-muted-foreground sm:w-32 sm:shrink-0">
                          {t('fields.agent.opencodePlanAgent.label')}
                        </label>
                        <div className="flex flex-1 items-center gap-2">
                          <Input
                            value={localOpencodePlanAgent ?? 'plan'}
                            onChange={(e) => setLocalOpencodePlanAgent(e.target.value)}
                            placeholder="plan"
                            disabled={isLoading}
                            className="font-mono text-sm"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={handleResetOpencodePlanAgent}
                            disabled={isLoading || resetConfig.isPending}
                            title={tc('buttons.reset')}
                          >
                            <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground sm:ml-32 sm:pl-2">
                        {t('fields.agent.opencodePlanAgent.description')}
                      </p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
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

                  {/* Toast (in-app) */}
                  <div className="space-y-2 pl-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={toastEnabled}
                        onCheckedChange={setToastEnabled}
                        disabled={isLoading || !notificationsEnabled}
                      />
                      <label className="text-sm text-muted-foreground">{t('notifications.toast')}</label>
                    </div>
                    <p className="ml-10 text-xs text-muted-foreground">
                      {t('notifications.toastDescription')}
                    </p>
                  </div>

                  {/* Desktop (browser/native) */}
                  <div className="space-y-2 pl-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={desktopEnabled}
                        onCheckedChange={setDesktopEnabled}
                        disabled={isLoading || !notificationsEnabled}
                      />
                      <label className="text-sm text-muted-foreground">{t('notifications.desktop')}</label>
                    </div>
                    <p className="ml-10 text-xs text-muted-foreground">
                      {t('notifications.desktopDescription')}
                    </p>
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
                      <div className="ml-auto flex items-center gap-1">
                        {/* Upload custom sound */}
                        <input
                          ref={soundInputRef}
                          type="file"
                          accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg"
                          className="hidden"
                          onChange={handleSoundUpload}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => soundInputRef.current?.click()}
                          disabled={isLoading || !notificationsEnabled || !soundEnabled || isUploadingSound}
                          title={t('notifications.uploadSound')}
                        >
                          {isUploadingSound ? (
                            <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                          ) : (
                            <HugeiconsIcon icon={Upload04Icon} size={14} strokeWidth={2} />
                          )}
                        </Button>
                        {/* Delete custom sound (only shown if custom sound exists) */}
                        {hasCustomSound && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={handleDeleteCustomSound}
                            disabled={isLoading || !notificationsEnabled || !soundEnabled}
                            title={t('notifications.deleteSound')}
                          >
                            <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
                          </Button>
                        )}
                        {/* Test sound */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => handleTestChannel('sound')}
                          disabled={isLoading || !notificationsEnabled || !soundEnabled || testChannel.isPending}
                          title={t('notifications.testSound')}
                        >
                          {testChannel.isPending ? (
                            <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                          ) : (
                            <HugeiconsIcon icon={TestTube01Icon} size={14} strokeWidth={2} />
                          )}
                        </Button>
                      </div>
                    </div>
                    {hasCustomSound && (
                      <p className="ml-10 text-xs text-muted-foreground">
                        {t('notifications.customSoundActive')}
                      </p>
                    )}
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
                      <div className="relative ml-6">
                        <Input
                          type="password"
                          value={slackWebhook}
                          onChange={(e) => setSlackWebhook(e.target.value)}
                          placeholder="https://hooks.slack.com/services/..."
                          disabled={isLoading || !notificationsEnabled}
                          className="flex-1 pr-8 font-mono text-sm"
                        />
                        {!!notificationSettings?.slack?.webhookUrl && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500">
                            <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />
                          </div>
                        )}
                      </div>
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
                      <div className="relative ml-6">
                        <Input
                          type="password"
                          value={discordWebhook}
                          onChange={(e) => setDiscordWebhook(e.target.value)}
                          placeholder="https://discord.com/api/webhooks/..."
                          disabled={isLoading || !notificationsEnabled}
                          className="flex-1 pr-8 font-mono text-sm"
                        />
                        {!!notificationSettings?.discord?.webhookUrl && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500">
                            <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />
                          </div>
                        )}
                      </div>
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
                        <div className="relative">
                          <Input
                            type="password"
                            value={pushoverAppToken}
                            onChange={(e) => setPushoverAppToken(e.target.value)}
                            placeholder={t('notifications.appToken')}
                            disabled={isLoading || !notificationsEnabled}
                            className="flex-1 pr-8 font-mono text-sm"
                          />
                          {!!notificationSettings?.pushover?.appToken && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500">
                              <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />
                            </div>
                          )}
                        </div>
                        <div className="relative">
                          <Input
                            type="password"
                            value={pushoverUserKey}
                            onChange={(e) => setPushoverUserKey(e.target.value)}
                            placeholder={t('notifications.userKey')}
                            disabled={isLoading || !notificationsEnabled}
                            className="flex-1 pr-8 font-mono text-sm"
                          />
                          {!!notificationSettings?.pushover?.userKey && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500">
                              <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </SettingsSection>

              {/* Appearance */}
              <SettingsSection title={t('sections.appearance')}>
                <div className="space-y-4">
                  {/* Language */}
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

                  {/* Theme */}
                  <div className="space-y-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <label className="text-sm text-muted-foreground sm:w-32 sm:shrink-0">
                        {t('fields.theme.label')}
                      </label>
                      <Select
                        value={theme ?? 'system'}
                        onValueChange={(v) => changeTheme(v as 'system' | 'light' | 'dark')}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="system">{t('fields.theme.options.system')}</SelectItem>
                          <SelectItem value="light">{t('fields.theme.options.light')}</SelectItem>
                          <SelectItem value="dark">{t('fields.theme.options.dark')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground sm:ml-32 sm:pl-2">
                      {t('fields.theme.description')}
                    </p>
                  </div>

                  {/* Sync Claude Code Theme */}
                  <div className="space-y-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <label className="text-sm text-muted-foreground sm:w-32 sm:shrink-0">
                        {t('fields.syncClaudeTheme.label')}
                      </label>
                      <Switch
                        checked={localSyncClaudeCode}
                        onCheckedChange={setLocalSyncClaudeCode}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground sm:ml-32 sm:pl-2">
                      {t('fields.syncClaudeTheme.description')}
                    </p>
                  </div>

                  {/* Claude Code Theme Options (shown when sync is enabled) */}
                  {localSyncClaudeCode && (
                    <div className="space-y-3 border-t border-border pt-4 sm:ml-32 sm:pl-2">
                      {/* Light Theme */}
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="text-sm text-muted-foreground sm:w-24 sm:shrink-0">
                          {t('fields.claudeCodeTheme.light')}
                        </label>
                        <Select
                          value={localClaudeCodeLightTheme}
                          onValueChange={(v) => setLocalClaudeCodeLightTheme(v as ClaudeCodeTheme)}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CLAUDE_CODE_THEMES.filter(thm => thm.startsWith('light')).map((thm) => (
                              <SelectItem key={thm} value={thm}>
                                {t(`fields.claudeCodeTheme.options.${thm}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Dark Theme */}
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="text-sm text-muted-foreground sm:w-24 sm:shrink-0">
                          {t('fields.claudeCodeTheme.dark')}
                        </label>
                        <Select
                          value={localClaudeCodeDarkTheme}
                          onValueChange={(v) => setLocalClaudeCodeDarkTheme(v as ClaudeCodeTheme)}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CLAUDE_CODE_THEMES.filter(thm => thm.startsWith('dark')).map((thm) => (
                              <SelectItem key={thm} value={thm}>
                                {t(`fields.claudeCodeTheme.options.${thm}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

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
        </div>
      </div>

      {/* Sticky Save Button Footer */}
      <div className="shrink-0 border-t border-border bg-background px-6 py-3">
        <div className={`mx-auto flex max-w-5xl items-center gap-2 ${isDesktop ? 'justify-start' : 'justify-end'}`}>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-accent">
              <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />
              {tc('status.saved')}
            </span>
          )}
          <Button
            size="sm"
            onClick={handleSaveAll}
            disabled={!hasChanges || isLoading || updateConfig.isPending || updateNotifications.isPending || updateZAi.isPending || updateDeploymentSettings.isPending}
          >
            {tc('buttons.save')}
          </Button>
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
