import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FilesystemBrowser } from '@/components/ui/filesystem-browser'
import { HugeiconsIcon } from '@hugeicons/react'
import { Folder01Icon } from '@hugeicons/core-free-icons'
import { useEditorApp, useEditorHost, useEditorSshPort, useHomeDir } from '@/hooks/use-config'
import { usePathStat } from '@/hooks/use-filesystem'
import { expandTildePath } from '@/lib/path-utils'
import { buildEditorUrl, openExternalUrl, getEditorDisplayName } from '@/lib/editor-url'

interface OpenInEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function OpenInEditorDialog({ open, onOpenChange }: OpenInEditorDialogProps) {
  const { t } = useTranslation('navigation')
  const [path, setPath] = useState('')
  const [browserOpen, setBrowserOpen] = useState(false)

  const { data: editorApp } = useEditorApp()
  const { data: editorHost } = useEditorHost()
  const { data: editorSshPort } = useEditorSshPort()
  const { data: homeDir } = useHomeDir()

  // Validate the path - only allow directories
  const { data: pathStat, isLoading: isValidating } = usePathStat(path.trim() || null)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setPath('')
    }
  }, [open])

  // Determine if the path is valid (exists and is a directory)
  const isValidDirectory = pathStat?.exists && pathStat?.isDirectory
  const pathError = path.trim() && pathStat && !isValidating
    ? !pathStat.exists
      ? t('openInEditor.pathNotFound')
      : !pathStat.isDirectory
        ? t('openInEditor.pathNotDirectory')
        : null
    : null

  const handleOpen = () => {
    if (!path.trim() || !isValidDirectory) return

    // Expand ~ to home directory before building URL
    const expandedPath = expandTildePath(path.trim(), homeDir)

    const url = buildEditorUrl(
      expandedPath,
      editorApp ?? 'vscode',
      editorHost ?? '',
      editorSshPort ?? 22
    )
    openExternalUrl(url)
    onOpenChange(false)
  }

  const handleBrowseSelect = (selectedPath: string) => {
    setPath(selectedPath)
  }

  const editorName = getEditorDisplayName(editorApp ?? 'vscode')

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('openInEditor.title')}</DialogTitle>
            <DialogDescription>
              {t('openInEditor.description', { editor: editorName })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('openInEditor.pathLabel')}</label>
              <div className="flex gap-2">
                <Input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder={t('openInEditor.pathPlaceholder')}
                  onKeyDown={(e) => e.key === 'Enter' && handleOpen()}
                  className={`flex-1 font-mono text-sm ${pathError ? 'border-destructive' : ''}`}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setBrowserOpen(true)}
                  title={t('openInEditor.browse')}
                >
                  <HugeiconsIcon icon={Folder01Icon} size={16} strokeWidth={2} />
                </Button>
              </div>
              {pathError ? (
                <p className="text-xs text-destructive">{pathError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t('openInEditor.pathHint')}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {t('openInEditor.cancel')}
            </DialogClose>
            <Button onClick={handleOpen} disabled={!path.trim() || !isValidDirectory || isValidating}>
              {t('openInEditor.open')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FilesystemBrowser
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        onSelect={handleBrowseSelect}
      />
    </>
  )
}
