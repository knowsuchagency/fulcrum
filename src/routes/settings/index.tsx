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
  useDatabasePath,
  useWorktreeBasePath,
  useDefaultGitReposDir,
  useTaskCreationCommand,
  useUpdateConfig,
  useResetConfig,
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
  const updateConfig = useUpdateConfig()
  const resetConfig = useResetConfig()

  const [localPort, setLocalPort] = useState('')
  const [localDatabasePath, setLocalDatabasePath] = useState('')
  const [localWorktreePath, setLocalWorktreePath] = useState('')
  const [localReposDir, setLocalReposDir] = useState('')
  const [localTaskCommand, setLocalTaskCommand] = useState('')
  const [databaseBrowserOpen, setDatabaseBrowserOpen] = useState(false)
  const [worktreeBrowserOpen, setWorktreeBrowserOpen] = useState(false)
  const [reposDirBrowserOpen, setReposDirBrowserOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  // Sync local form state with fetched server values
   
  useEffect(() => {
    if (port !== undefined) setLocalPort(String(port))
    if (databasePath) setLocalDatabasePath(databasePath)
    if (worktreeBasePath) setLocalWorktreePath(worktreeBasePath)
    if (defaultGitReposDir !== undefined) setLocalReposDir(defaultGitReposDir)
    if (taskCreationCommand !== undefined) setLocalTaskCommand(taskCreationCommand)
  }, [port, databasePath, worktreeBasePath, defaultGitReposDir, taskCreationCommand])

  const isLoading =
    portLoading || databaseLoading || worktreeLoading || reposDirLoading || taskCommandLoading
  const hasChanges =
    localPort !== String(port) ||
    localDatabasePath !== databasePath ||
    localWorktreePath !== worktreeBasePath ||
    localReposDir !== defaultGitReposDir ||
    localTaskCommand !== taskCreationCommand

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
