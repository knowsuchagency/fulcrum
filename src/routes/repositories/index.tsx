import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  useRepositories,
  useCreateRepository,
  useDeleteRepository,
} from '@/hooks/use-repositories'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Delete02Icon,
  PlusSignIcon,
  Folder01Icon,
  Loading03Icon,
  Alert02Icon,
  CommandLineIcon,
  Copy01Icon,
  VisualStudioCodeIcon,
} from '@hugeicons/core-free-icons'
import { FilesystemBrowser } from '@/components/ui/filesystem-browser'
import { useDefaultGitReposDir, useEditorApp, useEditorHost, useEditorSshPort } from '@/hooks/use-config'
import { buildEditorUrl, getEditorDisplayName } from '@/lib/editor-url'
import type { Repository } from '@/types'
import { CreateTaskModal } from '@/components/kanban/create-task-modal'

export const Route = createFileRoute('/repositories/')({
  component: RepositoriesView,
})

function RepositoryCard({
  repository,
  onDelete,
  onStartTask,
}: {
  repository: Repository
  onDelete: () => Promise<void>
  onStartTask: () => void
}) {
  const { t } = useTranslation('repositories')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const { data: editorApp } = useEditorApp()
  const { data: editorHost } = useEditorHost()
  const { data: editorSshPort } = useEditorSshPort()

  const handleOpenEditor = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const url = buildEditorUrl(repository.path, editorApp, editorHost, editorSshPort)
    window.open(url, '_blank')
  }

  const handleStartTask = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onStartTask()
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDeleting(true)
    try {
      await onDelete()
      setDialogOpen(false)
    } catch {
      // Keep dialog open on error
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="relative h-full">
      <Link to="/repositories/$repoId" params={{ repoId: repository.id }} className="block h-full">
        <Card className="h-full transition-colors hover:border-border/80 cursor-pointer">
          <CardContent className="flex h-full flex-col gap-2 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-medium">{repository.displayName}</span>
            </div>

            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <HugeiconsIcon icon={Folder01Icon} size={12} strokeWidth={2} className="shrink-0" />
                <span className="truncate font-mono">{repository.path}</span>
              </div>

              {repository.startupScript && (
                <div className="flex items-center gap-1.5">
                  <HugeiconsIcon
                    icon={CommandLineIcon}
                    size={12}
                    strokeWidth={2}
                    className="shrink-0"
                  />
                  <span className="truncate font-mono">{repository.startupScript}</span>
                </div>
              )}

              {repository.copyFiles && (
                <div className="flex items-center gap-1.5">
                  <HugeiconsIcon icon={Copy01Icon} size={12} strokeWidth={2} className="shrink-0" />
                  <span className="truncate font-mono">{repository.copyFiles}</span>
                </div>
              )}
            </div>

            <div className="mt-auto flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleStartTask}
                className="border-primary text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} data-slot="icon" />
                {t('newTask')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </Link>

      <div className="absolute right-3 top-3 flex gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleOpenEditor}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title={`Open in ${getEditorDisplayName(editorApp)}`}
        >
          <HugeiconsIcon icon={VisualStudioCodeIcon} size={14} strokeWidth={2} />
        </Button>

        <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground hover:text-destructive"
              />
            }
          >
            <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('delete.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('delete.description', { name: repository.displayName })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>{t('addModal.cancel')}</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting}
                className="gap-2"
              >
                {isDeleting && (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    size={14}
                    strokeWidth={2}
                    className="animate-spin"
                  />
                )}
                {isDeleting ? t('delete.deleting') : t('delete.button')}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

function CreateRepositoryDialog() {
  const { t } = useTranslation('repositories')
  const [open, setOpen] = useState(false)
  const [browserOpen, setBrowserOpen] = useState(false)
  const [path, setPath] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [startupScript, setStartupScript] = useState('')
  const [copyFiles, setCopyFiles] = useState('')

  const createRepository = useCreateRepository()
  const { data: defaultGitReposDir } = useDefaultGitReposDir()

  const handlePathSelect = (selectedPath: string) => {
    setPath(selectedPath)
    // Auto-fill display name from folder name
    if (!displayName) {
      setDisplayName(selectedPath.split('/').pop() || '')
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!path.trim()) return

    createRepository.mutate(
      {
        path: path.trim(),
        displayName: displayName.trim() || path.split('/').pop() || 'repo',
        startupScript: startupScript.trim() || null,
        copyFiles: copyFiles.trim() || null,
      },
      {
        onSuccess: () => {
          setOpen(false)
          setPath('')
          setDisplayName('')
          setStartupScript('')
          setCopyFiles('')
        },
      }
    )
  }

  const folderName = path ? path.split('/').pop() : ''

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button size="sm" />}>
          <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} data-slot="icon" />
          {t('addRepository')}
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{t('addModal.title')}</DialogTitle>
              <DialogDescription>
                {t('addModal.description')}
              </DialogDescription>
            </DialogHeader>

            <FieldGroup className="mt-4">
              <Field>
                <FieldLabel>{t('addModal.fields.path')}</FieldLabel>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start font-normal"
                  onClick={() => setBrowserOpen(true)}
                >
                  <HugeiconsIcon
                    icon={Folder01Icon}
                    size={14}
                    strokeWidth={2}
                    className="mr-2"
                  />
                  {folderName ? (
                    <span className="truncate">{path}</span>
                  ) : (
                    <span className="text-muted-foreground">{t('addModal.fields.pathPlaceholder')}</span>
                  )}
                </Button>
              </Field>

              <Field>
                <FieldLabel htmlFor="displayName">{t('addModal.fields.displayName')}</FieldLabel>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={folderName || 'My Project'}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="startupScript">{t('addModal.fields.startupScript')}</FieldLabel>
                <Textarea
                  id="startupScript"
                  value={startupScript}
                  onChange={(e) => setStartupScript(e.target.value)}
                  placeholder={t('addModal.fields.startupScriptPlaceholder')}
                  rows={2}
                />
                <FieldDescription>
                  {t('addModal.fields.startupScriptDescription')}
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="copyFiles">{t('addModal.fields.copyFiles')}</FieldLabel>
                <Input
                  id="copyFiles"
                  value={copyFiles}
                  onChange={(e) => setCopyFiles(e.target.value)}
                  placeholder={t('addModal.fields.copyFilesPlaceholder')}
                />
                <FieldDescription>
                  {t('addModal.fields.copyFilesDescription')}
                </FieldDescription>
              </Field>
            </FieldGroup>

            <DialogFooter className="mt-4">
              <DialogClose render={<Button variant="outline" type="button" />}>{t('addModal.cancel')}</DialogClose>
              <Button type="submit" disabled={createRepository.isPending || !path.trim()}>
                {createRepository.isPending ? t('addModal.adding') : t('addRepository')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <FilesystemBrowser
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        onSelect={handlePathSelect}
        initialPath={defaultGitReposDir || undefined}
      />
    </>
  )
}

function RepositoriesView() {
  const { t } = useTranslation('repositories')
  const { data: repositories, isLoading, error } = useRepositories()
  const deleteRepository = useDeleteRepository()
  const [taskModalRepo, setTaskModalRepo] = useState<Repository | null>(null)

  const handleDelete = async (id: string) => {
    await deleteRepository.mutateAsync(id)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-medium">{t('title')}</h1>
          {repositories && (
            <div className="text-xs text-muted-foreground">{t('total', { count: repositories.length })}</div>
          )}
        </div>

        <CreateRepositoryDialog />
      </div>

      <div className="pixel-grid flex-1 overflow-auto p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <HugeiconsIcon
              icon={Loading03Icon}
              size={24}
              strokeWidth={2}
              className="animate-spin text-muted-foreground"
            />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 py-6 text-destructive">
            <HugeiconsIcon icon={Alert02Icon} size={20} strokeWidth={2} />
            <span className="text-sm">{t('error.failedToLoad', { message: error.message })}</span>
          </div>
        )}

        {!isLoading && !error && repositories?.length === 0 && (
          <div className="py-12 text-muted-foreground">
            <p className="text-sm">
              {t('empty.noRepositories')}
            </p>
          </div>
        )}

        <div className="grid auto-rows-fr grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {repositories?.map((repo) => (
            <RepositoryCard
              key={repo.id}
              repository={repo}
              onDelete={() => handleDelete(repo.id)}
              onStartTask={() => setTaskModalRepo(repo)}
            />
          ))}
        </div>
      </div>

      <CreateTaskModal
        open={taskModalRepo !== null}
        onOpenChange={(open) => !open && setTaskModalRepo(null)}
        defaultRepository={taskModalRepo ?? undefined}
        showTrigger={false}
      />
    </div>
  )
}
