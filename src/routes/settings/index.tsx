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
  useWorktreeBasePath,
  useUpdateConfig,
  useResetConfig,
  CONFIG_KEYS,
} from '@/hooks/use-config'

export const Route = createFileRoute('/settings/')({
  component: SettingsPage,
})

function SettingsPage() {
  const { data: worktreeBasePath, isDefault, isLoading } = useWorktreeBasePath()
  const updateConfig = useUpdateConfig()
  const resetConfig = useResetConfig()

  const [localPath, setLocalPath] = useState('')
  const [browserOpen, setBrowserOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  // Sync local state with fetched value
  useEffect(() => {
    if (worktreeBasePath) {
      setLocalPath(worktreeBasePath)
    }
  }, [worktreeBasePath])

  const hasChanges = localPath !== worktreeBasePath

  const handleSave = () => {
    updateConfig.mutate(
      { key: CONFIG_KEYS.WORKTREE_BASE_PATH, value: localPath },
      {
        onSuccess: () => {
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
        },
      }
    )
  }

  const handleReset = () => {
    resetConfig.mutate(CONFIG_KEYS.WORKTREE_BASE_PATH, {
      onSuccess: (data) => {
        if (data.value) {
          setLocalPath(data.value)
        }
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      },
    })
  }

  const handleBrowseSelect = (path: string) => {
    setLocalPath(path)
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
                  {isDefault && (
                    <span className="ml-1 text-muted-foreground">(using default)</span>
                  )}
                </FieldDescription>
                <div className="flex gap-2">
                  <Input
                    value={localPath}
                    onChange={(e) => setLocalPath(e.target.value)}
                    placeholder="/tmp/vibora/worktrees"
                    disabled={isLoading}
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBrowserOpen(true)}
                    disabled={isLoading}
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
                  onClick={handleReset}
                  disabled={isLoading || resetConfig.isPending}
                >
                  <HugeiconsIcon icon={RotateLeft01Icon} size={14} strokeWidth={2} />
                  Reset to Default
                </Button>

                <div className="flex items-center gap-2">
                  {saved && (
                    <span className="flex items-center gap-1 text-xs text-emerald-500">
                      <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />
                      Saved
                    </span>
                  )}
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!hasChanges || isLoading || updateConfig.isPending}
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
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        onSelect={handleBrowseSelect}
        initialPath={localPath || undefined}
      />
    </div>
  )
}
