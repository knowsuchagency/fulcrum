import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { FilesystemBrowser } from '@/components/ui/filesystem-browser'
import { Switch } from '@/components/ui/switch'
import { HugeiconsIcon } from '@hugeicons/react'
import { Folder01Icon, RotateLeft01Icon, Tick02Icon, TestTube01Icon, Loading03Icon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import {
  usePort,
  useDatabasePath,
  useWorktreeBasePath,
  useDefaultGitReposDir,
  useTaskCreationCommand,
  useHostname,
  useSshPort,
  useLinearApiKey,
  useGitHubPat,
  useUpdateConfig,
  useResetConfig,
  useNotificationSettings,
  useUpdateNotificationSettings,
  useTestNotificationChannel,
  CONFIG_KEYS,
} from '@/hooks/use-config'

export const Route = createFileRoute('/settings/')({
  component: SettingsPage,
})

function SettingsPage() {
  const { data: port, isLoading: portLoading } = usePort()
  const { data: databasePath, isLoading: databaseLoading } = useDatabasePath()
  const { data: worktreeBasePath, isLoading: worktreeLoading } = useWorktreeBasePath()
  const { data: defaultGitReposDir, isLoading: reposDirLoading } = useDefaultGitReposDir()
  const { data: taskCreationCommand, isLoading: taskCommandLoading } = useTaskCreationCommand()
  const { data: hostname, isLoading: hostnameLoading } = useHostname()
  const { data: sshPort, isLoading: sshPortLoading } = useSshPort()
  const { data: linearApiKey, isLoading: linearApiKeyLoading } = useLinearApiKey()
  const { data: githubPat, isLoading: githubPatLoading } = useGitHubPat()
  const { data: notificationSettings, isLoading: notificationsLoading } = useNotificationSettings()
  const updateConfig = useUpdateConfig()
  const resetConfig = useResetConfig()
  const updateNotifications = useUpdateNotificationSettings()
  const testChannel = useTestNotificationChannel()

  const [localPort, setLocalPort] = useState('')
  const [localDatabasePath, setLocalDatabasePath] = useState('')
  const [localWorktreePath, setLocalWorktreePath] = useState('')
  const [localReposDir, setLocalReposDir] = useState('')
  const [localTaskCommand, setLocalTaskCommand] = useState('')
  const [localHostname, setLocalHostname] = useState('')
  const [localSshPort, setLocalSshPort] = useState('')
  const [localLinearApiKey, setLocalLinearApiKey] = useState('')
  const [localGitHubPat, setLocalGitHubPat] = useState('')
  const [databaseBrowserOpen, setDatabaseBrowserOpen] = useState(false)
  const [worktreeBrowserOpen, setWorktreeBrowserOpen] = useState(false)
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

  // Sync local form state with fetched server values
  useEffect(() => {
    if (port !== undefined) setLocalPort(String(port))
    if (databasePath) setLocalDatabasePath(databasePath)
    if (worktreeBasePath) setLocalWorktreePath(worktreeBasePath)
    if (defaultGitReposDir !== undefined) setLocalReposDir(defaultGitReposDir)
    if (taskCreationCommand !== undefined) setLocalTaskCommand(taskCreationCommand)
    if (hostname !== undefined) setLocalHostname(hostname)
    if (sshPort !== undefined) setLocalSshPort(String(sshPort))
    if (linearApiKey !== undefined) setLocalLinearApiKey(linearApiKey)
    if (githubPat !== undefined) setLocalGitHubPat(githubPat)
  }, [port, databasePath, worktreeBasePath, defaultGitReposDir, taskCreationCommand, hostname, sshPort, linearApiKey, githubPat])

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

  const isLoading =
    portLoading || databaseLoading || worktreeLoading || reposDirLoading || taskCommandLoading || hostnameLoading || sshPortLoading || linearApiKeyLoading || githubPatLoading || notificationsLoading

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
  const hasChanges =
    localPort !== String(port) ||
    localDatabasePath !== databasePath ||
    localWorktreePath !== worktreeBasePath ||
    localReposDir !== defaultGitReposDir ||
    localTaskCommand !== taskCreationCommand ||
    localHostname !== hostname ||
    localSshPort !== String(sshPort) ||
    localLinearApiKey !== linearApiKey ||
    localGitHubPat !== githubPat ||
    hasNotificationChanges

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

    if (localDatabasePath !== databasePath) {
      promises.push(
        new Promise((resolve) => {
          updateConfig.mutate(
            { key: CONFIG_KEYS.DATABASE_PATH, value: localDatabasePath },
            { onSettled: resolve }
          )
        })
      )
    }

    if (localWorktreePath !== worktreeBasePath) {
      promises.push(
        new Promise((resolve) => {
          updateConfig.mutate(
            { key: CONFIG_KEYS.WORKTREE_BASE_PATH, value: localWorktreePath },
            { onSettled: resolve }
          )
        })
      )
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

    if (localTaskCommand !== taskCreationCommand) {
      promises.push(
        new Promise((resolve) => {
          updateConfig.mutate(
            { key: CONFIG_KEYS.TASK_CREATION_COMMAND, value: localTaskCommand },
            { onSettled: resolve }
          )
        })
      )
    }

    if (localHostname !== hostname) {
      promises.push(
        new Promise((resolve) => {
          updateConfig.mutate(
            { key: CONFIG_KEYS.HOSTNAME, value: localHostname },
            { onSettled: resolve }
          )
        })
      )
    }

    if (localSshPort !== String(sshPort)) {
      const portNum = parseInt(localSshPort, 10)
      if (!isNaN(portNum) && portNum >= 1 && portNum <= 65535) {
        promises.push(
          new Promise((resolve) => {
            updateConfig.mutate(
              { key: CONFIG_KEYS.SSH_PORT, value: portNum },
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

    await Promise.all(promises)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTestChannel = async (channel: 'sound' | 'slack' | 'discord' | 'pushover') => {
    testChannel.mutate(channel, {
      onSuccess: (result) => {
        if (result.success) {
          toast.success(`${channel} test successful`)
        } else {
          toast.error(`${channel} test failed: ${result.error}`)
        }
      },
      onError: (error) => {
        toast.error(`Test failed: ${error.message}`)
      },
    })
  }

  const handleResetPort = () => {
    resetConfig.mutate(CONFIG_KEYS.PORT, {
      onSuccess: (data) => {
        if (data.value !== null) setLocalPort(String(data.value))
      },
    })
  }

  const handleResetDatabasePath = () => {
    resetConfig.mutate(CONFIG_KEYS.DATABASE_PATH, {
      onSuccess: (data) => {
        if (data.value) setLocalDatabasePath(String(data.value))
      },
    })
  }

  const handleResetWorktree = () => {
    resetConfig.mutate(CONFIG_KEYS.WORKTREE_BASE_PATH, {
      onSuccess: (data) => {
        if (data.value) setLocalWorktreePath(String(data.value))
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

  const handleResetTaskCommand = () => {
    resetConfig.mutate(CONFIG_KEYS.TASK_CREATION_COMMAND, {
      onSuccess: (data) => {
        if (data.value !== null && data.value !== undefined)
          setLocalTaskCommand(String(data.value))
      },
    })
  }

  const handleResetHostname = () => {
    resetConfig.mutate(CONFIG_KEYS.HOSTNAME, {
      onSuccess: (data) => {
        if (data.value !== null && data.value !== undefined)
          setLocalHostname(String(data.value))
      },
    })
  }

  const handleResetSshPort = () => {
    resetConfig.mutate(CONFIG_KEYS.SSH_PORT, {
      onSuccess: (data) => {
        if (data.value !== null && data.value !== undefined)
          setLocalSshPort(String(data.value))
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <h1 className="text-sm font-medium">Settings</h1>
      </div>

      <div className="pixel-grid flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-2xl">
          <Card>
            <CardContent className="space-y-6 pt-6">
              {/* Server Section */}
              <div className="space-y-4">
                <h2 className="text-sm font-medium text-foreground">Server</h2>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="w-40 shrink-0 text-sm text-muted-foreground">Port</label>
                    <Input
                      type="number"
                      min={1}
                      max={65535}
                      value={localPort}
                      onChange={(e) => setLocalPort(e.target.value)}
                      placeholder="3333"
                      disabled={isLoading}
                      className="w-24 font-mono text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={handleResetPort}
                      disabled={isLoading || resetConfig.isPending}
                      title="Reset to default"
                    >
                      <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                    </Button>
                  </div>
                  <p className="ml-40 pl-2 text-xs text-muted-foreground">
                    Requires server restart
                  </p>
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Paths Section */}
              <div className="space-y-4">
                <h2 className="text-sm font-medium text-foreground">Paths</h2>

                {/* Database Path */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="w-40 shrink-0 text-sm text-muted-foreground">
                      Database Path
                    </label>
                    <Input
                      value={localDatabasePath}
                      onChange={(e) => setLocalDatabasePath(e.target.value)}
                      placeholder="~/.vibora/vibora.db"
                      disabled={isLoading}
                      className="flex-1 font-mono text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => setDatabaseBrowserOpen(true)}
                      disabled={isLoading}
                      title="Browse"
                    >
                      <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={2} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={handleResetDatabasePath}
                      disabled={isLoading || resetConfig.isPending}
                      title="Reset to default"
                    >
                      <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                    </Button>
                  </div>
                  <p className="ml-40 pl-2 text-xs text-muted-foreground">
                    SQLite database file location (requires restart)
                  </p>
                </div>

                {/* Worktree Directory */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="w-40 shrink-0 text-sm text-muted-foreground">
                      Worktree Directory
                    </label>
                    <Input
                      value={localWorktreePath}
                      onChange={(e) => setLocalWorktreePath(e.target.value)}
                      placeholder="~/.vibora/worktrees"
                      disabled={isLoading}
                      className="flex-1 font-mono text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => setWorktreeBrowserOpen(true)}
                      disabled={isLoading}
                      title="Browse"
                    >
                      <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={2} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={handleResetWorktree}
                      disabled={isLoading || resetConfig.isPending}
                      title="Reset to default"
                    >
                      <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                    </Button>
                  </div>
                  <p className="ml-40 pl-2 text-xs text-muted-foreground">
                    Where task worktrees are created
                  </p>
                </div>

                {/* Git Repos Directory */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="w-40 shrink-0 text-sm text-muted-foreground">
                      Git Repos Directory
                    </label>
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
                      title="Browse"
                    >
                      <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={2} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={handleResetReposDir}
                      disabled={isLoading || resetConfig.isPending}
                      title="Reset to default"
                    >
                      <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                    </Button>
                  </div>
                  <p className="ml-40 pl-2 text-xs text-muted-foreground">
                    Starting directory for repo picker
                  </p>
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Task Defaults Section */}
              <div className="space-y-4">
                <h2 className="text-sm font-medium text-foreground">Task Defaults</h2>

                {/* Task Creation Command */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="w-40 shrink-0 text-sm text-muted-foreground">
                      Startup Command
                    </label>
                    <Input
                      value={localTaskCommand}
                      onChange={(e) => setLocalTaskCommand(e.target.value)}
                      placeholder="claude --dangerously-skip-permissions"
                      disabled={isLoading}
                      className="flex-1 font-mono text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={handleResetTaskCommand}
                      disabled={isLoading || resetConfig.isPending}
                      title="Reset to default"
                    >
                      <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                    </Button>
                  </div>
                  <p className="ml-40 pl-2 text-xs text-muted-foreground">
                    Command to run when a new task terminal is created (leave empty to disable)
                  </p>
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Remote Access Section */}
              <div className="space-y-4">
                <h2 className="text-sm font-medium text-foreground">Remote Access</h2>

                {/* Hostname */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="w-40 shrink-0 text-sm text-muted-foreground">
                      Hostname
                    </label>
                    <Input
                      value={localHostname}
                      onChange={(e) => setLocalHostname(e.target.value)}
                      placeholder="e.g., citadel"
                      disabled={isLoading}
                      className="flex-1 font-mono text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={handleResetHostname}
                      disabled={isLoading || resetConfig.isPending}
                      title="Reset to default"
                    >
                      <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                    </Button>
                  </div>
                  <p className="ml-40 pl-2 text-xs text-muted-foreground">
                    Remote machine hostname for VS Code SSH URLs (leave empty for local)
                  </p>
                </div>

                {/* SSH Port */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="w-40 shrink-0 text-sm text-muted-foreground">
                      SSH Port
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={65535}
                      value={localSshPort}
                      onChange={(e) => setLocalSshPort(e.target.value)}
                      placeholder="22"
                      disabled={isLoading}
                      className="w-24 font-mono text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={handleResetSshPort}
                      disabled={isLoading || resetConfig.isPending}
                      title="Reset to default"
                    >
                      <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                    </Button>
                  </div>
                  <p className="ml-40 pl-2 text-xs text-muted-foreground">
                    SSH port for VS Code remote connections
                  </p>
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Integrations Section */}
              <div className="space-y-4">
                <h2 className="text-sm font-medium text-foreground">Integrations</h2>

                {/* Linear API Key */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="w-40 shrink-0 text-sm text-muted-foreground">
                      Linear API Key
                    </label>
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
                      title="Reset to default"
                    >
                      <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                    </Button>
                  </div>
                  <p className="ml-40 pl-2 text-xs text-muted-foreground">
                    Personal API key from Linear for syncing ticket status
                  </p>
                </div>

                {/* GitHub PAT */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="w-40 shrink-0 text-sm text-muted-foreground">
                      GitHub PAT
                    </label>
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
                      title="Reset to default"
                    >
                      <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                    </Button>
                  </div>
                  <p className="ml-40 pl-2 text-xs text-muted-foreground">
                    Personal access token for GitHub API (Issues & PRs in Review)
                  </p>
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Notifications Section */}
              <div className="space-y-4">
                <h2 className="text-sm font-medium text-foreground">Notifications</h2>

                {/* Master toggle */}
                <div className="flex items-center gap-2">
                  <label className="w-40 shrink-0 text-sm text-muted-foreground">
                    Enable Notifications
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
                    <label className="text-sm text-muted-foreground">Sound (macOS only)</label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => handleTestChannel('sound')}
                      disabled={isLoading || !notificationsEnabled || !soundEnabled || testChannel.isPending}
                      title="Test sound"
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
                    <label className="text-sm text-muted-foreground">Slack</label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => handleTestChannel('slack')}
                      disabled={isLoading || !notificationsEnabled || !slackEnabled || !slackWebhook || testChannel.isPending}
                      title="Test Slack"
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
                    <label className="text-sm text-muted-foreground">Discord</label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => handleTestChannel('discord')}
                      disabled={isLoading || !notificationsEnabled || !discordEnabled || !discordWebhook || testChannel.isPending}
                      title="Test Discord"
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
                    <label className="text-sm text-muted-foreground">Pushover</label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => handleTestChannel('pushover')}
                      disabled={isLoading || !notificationsEnabled || !pushoverEnabled || !pushoverAppToken || !pushoverUserKey || testChannel.isPending}
                      title="Test Pushover"
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
                        placeholder="App Token"
                        disabled={isLoading || !notificationsEnabled}
                        className="font-mono text-sm"
                      />
                      <Input
                        type="password"
                        value={pushoverUserKey}
                        onChange={(e) => setPushoverUserKey(e.target.value)}
                        placeholder="User Key"
                        disabled={isLoading || !notificationsEnabled}
                        className="font-mono text-sm"
                      />
                    </div>
                  )}
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex items-center justify-end gap-2 border-t border-border">
              {saved && (
                <span className="flex items-center gap-1 text-xs text-emerald-500">
                  <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />
                  Saved
                </span>
              )}
              <Button
                size="sm"
                onClick={handleSaveAll}
                disabled={!hasChanges || isLoading || updateConfig.isPending}
              >
                Save Changes
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      <FilesystemBrowser
        open={databaseBrowserOpen}
        onOpenChange={setDatabaseBrowserOpen}
        onSelect={(path) => setLocalDatabasePath(path)}
        initialPath={localDatabasePath || undefined}
      />

      <FilesystemBrowser
        open={worktreeBrowserOpen}
        onOpenChange={setWorktreeBrowserOpen}
        onSelect={(path) => setLocalWorktreePath(path)}
        initialPath={localWorktreePath || undefined}
      />

      <FilesystemBrowser
        open={reposDirBrowserOpen}
        onOpenChange={setReposDirBrowserOpen}
        onSelect={(path) => setLocalReposDir(path)}
        initialPath={localReposDir || undefined}
      />
    </div>
  )
}
