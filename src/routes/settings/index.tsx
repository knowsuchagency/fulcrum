import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { FilesystemBrowser } from '@/components/ui/filesystem-browser'
import { HugeiconsIcon } from '@hugeicons/react'
import { Folder01Icon, RotateLeft01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import {
  usePort,
  useWorktreeBasePath,
  useDefaultGitReposDir,
  useUpdateConfig,
  useResetConfig,
  CONFIG_KEYS,
} from '@/hooks/use-config'

export const Route = createFileRoute('/settings/')({
  component: SettingsPage,
})

function SettingsPage() {
  const { data: port, isDefault: portIsDefault, isLoading: portLoading } = usePort()
  const { data: worktreeBasePath, isDefault: worktreeIsDefault, isLoading: worktreeLoading } = useWorktreeBasePath()
  const { data: defaultGitReposDir, isDefault: reposDirIsDefault, isLoading: reposDirLoading } = useDefaultGitReposDir()
  const updateConfig = useUpdateConfig()
  const resetConfig = useResetConfig()

  const [localPort, setLocalPort] = useState('')
  const [localWorktreePath, setLocalWorktreePath] = useState('')
  const [localReposDir, setLocalReposDir] = useState('')
  const [worktreeBrowserOpen, setWorktreeBrowserOpen] = useState(false)
  const [reposDirBrowserOpen, setReposDirBrowserOpen] = useState(false)
  const [portSaved, setPortSaved] = useState(false)
  const [worktreeSaved, setWorktreeSaved] = useState(false)
  const [reposDirSaved, setReposDirSaved] = useState(false)

  // Sync local state with fetched values
  useEffect(() => {
    if (port !== undefined) {
      setLocalPort(String(port))
    }
  }, [port])

  useEffect(() => {
    if (worktreeBasePath) {
      setLocalWorktreePath(worktreeBasePath)
    }
  }, [worktreeBasePath])

  useEffect(() => {
    if (defaultGitReposDir !== undefined) {
      setLocalReposDir(defaultGitReposDir)
    }
  }, [defaultGitReposDir])

  const portHasChanges = localPort !== String(port)
  const worktreeHasChanges = localWorktreePath !== worktreeBasePath
  const reposDirHasChanges = localReposDir !== defaultGitReposDir

  const handlePortSave = () => {
    const portNum = parseInt(localPort, 10)
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) return
    updateConfig.mutate(
      { key: CONFIG_KEYS.PORT, value: portNum },
      {
        onSuccess: () => {
          setPortSaved(true)
          setTimeout(() => setPortSaved(false), 2000)
        },
      }
    )
  }

  const handlePortReset = () => {
    resetConfig.mutate(CONFIG_KEYS.PORT, {
      onSuccess: (data) => {
        if (data.value !== null) {
          setLocalPort(String(data.value))
        }
        setPortSaved(true)
        setTimeout(() => setPortSaved(false), 2000)
      },
    })
  }

  const handleWorktreeSave = () => {
    updateConfig.mutate(
      { key: CONFIG_KEYS.WORKTREE_BASE_PATH, value: localWorktreePath },
      {
        onSuccess: () => {
          setWorktreeSaved(true)
          setTimeout(() => setWorktreeSaved(false), 2000)
        },
      }
    )
  }

  const handleWorktreeReset = () => {
    resetConfig.mutate(CONFIG_KEYS.WORKTREE_BASE_PATH, {
      onSuccess: (data) => {
        if (data.value) {
          setLocalWorktreePath(data.value)
        }
        setWorktreeSaved(true)
        setTimeout(() => setWorktreeSaved(false), 2000)
      },
    })
  }

  const handleReposDirSave = () => {
    updateConfig.mutate(
      { key: CONFIG_KEYS.DEFAULT_GIT_REPOS_DIR, value: localReposDir },
      {
        onSuccess: () => {
          setReposDirSaved(true)
          setTimeout(() => setReposDirSaved(false), 2000)
        },
      }
    )
  }

  const handleReposDirReset = () => {
    resetConfig.mutate(CONFIG_KEYS.DEFAULT_GIT_REPOS_DIR, {
      onSuccess: (data) => {
        if (data.value) {
          setLocalReposDir(data.value)
        }
        setReposDirSaved(true)
        setTimeout(() => setReposDirSaved(false), 2000)
      },
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <h1 className="text-sm font-medium">Settings</h1>
      </div>

      <div className="pixel-grid flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Server</CardTitle>
              <CardDescription>
                Configure the server port. Changes require a server restart.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field>
                <FieldLabel>Port</FieldLabel>
                <FieldDescription>
                  The port the server listens on for HTTP and WebSocket connections.
                  {portIsDefault && (
                    <span className="ml-1 text-muted-foreground">(using default)</span>
                  )}
                </FieldDescription>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={localPort}
                  onChange={(e) => setLocalPort(e.target.value)}
                  placeholder="3222"
                  disabled={portLoading}
                  className="w-32 font-mono text-sm"
                />
              </Field>

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePortReset}
                  disabled={portLoading || resetConfig.isPending}
                >
                  <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                  Reset to Default
                </Button>

                <div className="flex items-center gap-2">
                  {portSaved && (
                    <span className="flex items-center gap-1 text-xs text-emerald-500">
                      <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />
                      Saved
                    </span>
                  )}
                  <Button
                    size="sm"
                    onClick={handlePortSave}
                    disabled={!portHasChanges || portLoading || updateConfig.isPending}
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Git Worktrees</CardTitle>
              <CardDescription>
                Configure where git worktrees are created for new tasks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field>
                <FieldLabel>Worktree Base Directory</FieldLabel>
                <FieldDescription>
                  New task worktrees will be created as subdirectories here.
                  {worktreeIsDefault && (
                    <span className="ml-1 text-muted-foreground">(using default)</span>
                  )}
                </FieldDescription>
                <div className="flex gap-2">
                  <Input
                    value={localWorktreePath}
                    onChange={(e) => setLocalWorktreePath(e.target.value)}
                    placeholder="/tmp/vibora/worktrees"
                    disabled={worktreeLoading}
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setWorktreeBrowserOpen(true)}
                    disabled={worktreeLoading}
                  >
                    <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={2} />
                    Browse
                  </Button>
                </div>
              </Field>

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleWorktreeReset}
                  disabled={worktreeLoading || resetConfig.isPending}
                >
                  <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                  Reset to Default
                </Button>

                <div className="flex items-center gap-2">
                  {worktreeSaved && (
                    <span className="flex items-center gap-1 text-xs text-emerald-500">
                      <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />
                      Saved
                    </span>
                  )}
                  <Button
                    size="sm"
                    onClick={handleWorktreeSave}
                    disabled={!worktreeHasChanges || worktreeLoading || updateConfig.isPending}
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Repository Browser</CardTitle>
              <CardDescription>
                Configure the default starting directory when browsing for git repositories
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field>
                <FieldLabel>Default Git Repos Directory</FieldLabel>
                <FieldDescription>
                  The repository picker will start in this directory when creating new tasks.
                  {reposDirIsDefault && (
                    <span className="ml-1 text-muted-foreground">(using default: home directory)</span>
                  )}
                </FieldDescription>
                <div className="flex gap-2">
                  <Input
                    value={localReposDir}
                    onChange={(e) => setLocalReposDir(e.target.value)}
                    placeholder="~/projects"
                    disabled={reposDirLoading}
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReposDirBrowserOpen(true)}
                    disabled={reposDirLoading}
                  >
                    <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={2} />
                    Browse
                  </Button>
                </div>
              </Field>

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReposDirReset}
                  disabled={reposDirLoading || resetConfig.isPending}
                >
                  <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                  Reset to Default
                </Button>

                <div className="flex items-center gap-2">
                  {reposDirSaved && (
                    <span className="flex items-center gap-1 text-xs text-emerald-500">
                      <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />
                      Saved
                    </span>
                  )}
                  <Button
                    size="sm"
                    onClick={handleReposDirSave}
                    disabled={!reposDirHasChanges || reposDirLoading || updateConfig.isPending}
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

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
