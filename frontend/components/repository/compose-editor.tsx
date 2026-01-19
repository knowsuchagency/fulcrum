import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  Alert02Icon,
  CheckmarkCircle02Icon,
  EyeIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MonacoEditor } from '@/components/viewer/monaco-editor'
import {
  useComposeFile,
  useWriteComposeFile,
  useSyncServices,
  useSwarmComposeFile,
} from '@/hooks/use-apps'
import type { App } from '@/types'

interface ComposeEditorProps {
  app: App
  repoPath: string
}

export function ComposeEditor({ app, repoPath }: ComposeEditorProps) {
  const { t } = useTranslation('common')
  const { data, isLoading, error } = useComposeFile(repoPath, app.composeFile)
  const writeCompose = useWriteComposeFile()
  const syncServices = useSyncServices()
  const swarmCompose = useSwarmComposeFile(app.id)

  const [content, setContent] = useState<string>('')
  const [savedContent, setSavedContent] = useState<string>('')
  const [saved, setSaved] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    if (data?.content !== undefined) {
      setContent(data.content)
      setSavedContent(data.content)
    }
  }, [data?.content])

  const hasUnsavedChanges = content !== savedContent

  const handleChange = useCallback((newContent: string) => {
    setContent(newContent)
    setSaved(false)
  }, [])

  const handleSave = useCallback(() => {
    if (!repoPath || !app.composeFile) return

    writeCompose.mutate(
      { repoPath, composeFile: app.composeFile, content },
      {
        onSuccess: () => {
          setSavedContent(content)
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
          syncServices.mutate(app.id)
        },
      }
    )
  }, [repoPath, app.composeFile, app.id, content, writeCompose, syncServices])

  if (isLoading) {
    return (
      <div className="rounded-lg border p-4">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
          {t('apps.compose.title')}
        </h4>
        <div className="flex items-center gap-2 text-muted-foreground">
          <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="animate-spin" />
          <span className="text-sm">{t('status.loading')}</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border p-4">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
          {t('apps.compose.title')}
        </h4>
        <div className="flex items-center gap-2 text-destructive">
          <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} />
          <span className="text-sm">{error.message}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t('apps.compose.title')}
          </h4>
          {hasUnsavedChanges && (
            <span className="text-xs text-amber-500">({t('apps.compose.unsavedChanges')})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{app.composeFile}</span>
          {hasUnsavedChanges && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setContent(savedContent)
                setSaved(false)
              }}
            >
              {t('apps.cancel')}
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={writeCompose.isPending || !hasUnsavedChanges}>
            {writeCompose.isPending ? (
              <>
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={14}
                  strokeWidth={2}
                  className="animate-spin"
                />
                {t('status.saving')}
              </>
            ) : saved ? (
              <>
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  size={14}
                  strokeWidth={2}
                  className="text-green-500"
                />
                {t('status.saved')}
              </>
            ) : (
              t('apps.compose.save')
            )}
          </Button>
        </div>
      </div>

      <div className="h-[400px] rounded-md border overflow-hidden">
        <MonacoEditor filePath={app.composeFile} content={content} onChange={handleChange} />
      </div>

      {/* Preview Generated Compose File */}
      <div className="flex items-center justify-between pt-2 border-t">
        <span className="text-xs text-muted-foreground">{t('apps.compose.previewDescription')}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            swarmCompose.refetch()
            setShowPreview(true)
          }}
        >
          <HugeiconsIcon icon={EyeIcon} size={14} strokeWidth={2} />
          {t('apps.compose.preview')}
        </Button>
      </div>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{t('apps.compose.generatedTitle')}</DialogTitle>
            <DialogDescription>{t('apps.compose.generatedDescription')}</DialogDescription>
          </DialogHeader>
          <div className="h-[500px] rounded-md border overflow-hidden">
            {swarmCompose.error ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center space-y-2">
                  <HugeiconsIcon
                    icon={Alert02Icon}
                    size={24}
                    strokeWidth={2}
                    className="mx-auto text-destructive"
                  />
                  <p className="text-sm">{swarmCompose.error.message}</p>
                </div>
              </div>
            ) : swarmCompose.data?.content ? (
              <MonacoEditor
                filePath="swarm-compose.yml"
                content={swarmCompose.data.content}
                onChange={() => {}}
                readOnly
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <HugeiconsIcon icon={Loading03Icon} size={24} strokeWidth={2} className="animate-spin" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
