import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { FilesystemBrowser } from '@/components/ui/filesystem-browser'
import { HugeiconsIcon } from '@hugeicons/react'
import { Folder01Icon, RotateLeft01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import {
  usePort,
  useWorktreeBasePath,
  useDefaultGitReposDir,
  useTaskCreationCommand,
  useHostname,
  useSshPort,
  useLinearApiKey,
  useUpdateConfig,
  useResetConfig,
  CONFIG_KEYS,
} from '@/hooks/use-config'

export const Route = createFileRoute('/settings/')({
  component: SettingsPage,
})

function SettingsPage() {
  const { data: port, isLoading: portLoading } = usePort()
  const { data: worktreeBasePath, isLoading: worktreeLoading } = useWorktreeBasePath()
  const { data: defaultGitReposDir, isLoading: reposDirLoading } = useDefaultGitReposDir()
  const { data: taskCreationCommand, isLoading: taskCommandLoading } = useTaskCreationCommand()
  const { data: hostname, isLoading: hostnameLoading } = useHostname()
  const { data: sshPort, isLoading: sshPortLoading } = useSshPort()
  const { data: linearApiKey, isLoading: linearApiKeyLoading } = useLinearApiKey()
  const updateConfig = useUpdateConfig()
  const resetConfig = useResetConfig()

  const [localPort, setLocalPort] = useState('')
  const [localReposDir, setLocalReposDir] = useState('')
  const [localTaskCommand, setLocalTaskCommand] = useState('')
  const [localHostname, setLocalHostname] = useState('')
  const [localSshPort, setLocalSshPort] = useState('')
  const [localLinearApiKey, setLocalLinearApiKey] = useState('')
  const [reposDirBrowserOpen, setReposDirBrowserOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  // Sync local form state with fetched server values
  useEffect(() => {
    if (port !== undefined) setLocalPort(String(port))
    if (defaultGitReposDir !== undefined) setLocalReposDir(defaultGitReposDir)
    if (taskCreationCommand !== undefined) setLocalTaskCommand(taskCreationCommand)
    if (hostname !== undefined) setLocalHostname(hostname)
    if (sshPort !== undefined) setLocalSshPort(String(sshPort))
    if (linearApiKey !== undefined) setLocalLinearApiKey(linearApiKey)
  }, [port, defaultGitReposDir, taskCreationCommand, hostname, sshPort, linearApiKey])

  const isLoading =
    portLoading || worktreeLoading || reposDirLoading || taskCommandLoading || hostnameLoading || sshPortLoading || linearApiKeyLoading
  const hasChanges =
    localPort !== String(port) ||
    localReposDir !== defaultGitReposDir ||
    localTaskCommand !== taskCreationCommand ||
    localHostname !== hostname ||
    localSshPort !== String(sshPort) ||
    localLinearApiKey !== linearApiKey

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

                {/* Worktree Directory (read-only) */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="w-40 shrink-0 text-sm text-muted-foreground">
                      Worktree Directory
                    </label>
                    <Input
                      value={worktreeBasePath}
                      disabled
                      className="flex-1 font-mono text-sm bg-muted"
                    />
                  </div>
                  <p className="ml-40 pl-2 text-xs text-muted-foreground">
                    Derived from VIBORA_DIR (read-only)
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
        open={reposDirBrowserOpen}
        onOpenChange={setReposDirBrowserOpen}
        onSelect={(path) => setLocalReposDir(path)}
        initialPath={localReposDir || undefined}
      />
    </div>
  )
}
