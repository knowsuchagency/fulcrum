import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  useRepositories,
  useCreateRepository,
  useDeleteRepository,
} from '@/hooks/use-repositories'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  TaskAdd01Icon,
  Folder01Icon,
  Loading03Icon,
  Alert02Icon,
  VisualStudioCodeIcon,
  ComputerTerminal01Icon,
  GridViewIcon,
} from '@hugeicons/core-free-icons'
import { FilesystemBrowser } from '@/components/ui/filesystem-browser'
import { useDefaultGitReposDir, useEditorApp, useEditorHost, useEditorSshPort } from '@/hooks/use-config'
import { useOpenInTerminal } from '@/hooks/use-open-in-terminal'
import { buildEditorUrl, getEditorDisplayName, openExternalUrl } from '@/lib/editor-url'
import type { Repository } from '@/types'
import { CreateTaskModal } from '@/components/kanban/create-task-modal'
import { NewProjectDialog } from '@/components/repositories/new-project-dialog'

export const Route = createFileRoute('/repositories/')({
  component: RepositoriesView,
})

function RepositoryCard({
  repository,
  onDelete,
  onStartTask,
  onOpenInTerminal,
  onViewTasks,
}: {
  repository: Repository
  onDelete: () => Promise<void>
  onStartTask: () => void
  onOpenInTerminal: () => void
  onViewTasks: () => void
}) {
  const { t } = useTranslation('repositories')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const { data: editorApp } = useEditorApp()
  const { data: editorHost } = useEditorHost()
  const { data: editorSshPort } = useEditorSshPort()

  const handleOpenEditor = () => {
    const url = buildEditorUrl(repository.path, editorApp, editorHost, editorSshPort)
    openExternalUrl(url)
  }

  const handleDelete = async () => {
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
    <Card className="h-full group transition-colors hover:border-foreground/20">
      <Link to="/repositories/$repoId" params={{ repoId: repository.id }} className="block">
        <CardContent className="flex flex-col gap-3 py-4">
          {/* Header: Name and path */}
          <div className="space-y-1">
            <span className="block truncate font-medium group-hover:text-primary transition-colors">{repository.displayName}</span>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <HugeiconsIcon icon={Folder01Icon} size={12} strokeWidth={2} className="shrink-0" />
              <span className="truncate font-mono">{repository.path}</span>
            </div>
          </div>
        </CardContent>
      </Link>
      <CardContent className="pt-0 pb-4 px-6">

        {/* Action buttons row */}
        <div className="mt-auto flex flex-wrap gap-1">
          {/* New Task */}
          <Button
            variant="outline"
            size="sm"
            onClick={onStartTask}
            className="text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={TaskAdd01Icon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">{t('newTask')}</span>
          </Button>

          {/* View Tasks */}
          <Button
            variant="outline"
            size="sm"
            onClick={onViewTasks}
            className="text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={GridViewIcon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">{t('viewTasks')}</span>
          </Button>

          {/* Terminal */}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenInTerminal}
            className="text-muted-foreground hover:text-foreground"
            title={t('openInTerminal')}
          >
            <HugeiconsIcon icon={ComputerTerminal01Icon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">{t('terminal')}</span>
          </Button>

          {/* Editor - hidden on mobile */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenEditor}
            className="text-muted-foreground hover:text-foreground max-sm:hidden"
            title={t('openInEditor', { editor: getEditorDisplayName(editorApp) })}
          >
            <HugeiconsIcon icon={VisualStudioCodeIcon} size={14} strokeWidth={2} data-slot="icon" />
            <span>{t('editor')}</span>
          </Button>

          {/* Delete */}
          <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <AlertDialogTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  title={t('delete.button')}
                />
              }
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} data-slot="icon" />
              <span className="max-sm:hidden">{t('delete.button')}</span>
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
      </CardContent>
    </Card>
  )
}

function AddRepositoryButton() {
  const { t } = useTranslation('repositories')
  const navigate = useNavigate()
  const [browserOpen, setBrowserOpen] = useState(false)

  const createRepository = useCreateRepository()
  const { data: defaultGitReposDir } = useDefaultGitReposDir()

  const handlePathSelect = (selectedPath: string) => {
    const displayName = selectedPath.split('/').pop() || 'repo'

    createRepository.mutate(
      {
        path: selectedPath,
        displayName,
      },
      {
        onSuccess: (repo) => {
          navigate({ to: '/repositories/$repoId', params: { repoId: repo.id } })
        },
      }
    )
  }

  return (
    <>
      <Button size="sm" onClick={() => setBrowserOpen(true)} disabled={createRepository.isPending}>
        <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} data-slot="icon" />
        {t('addRepository')}
      </Button>

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
  const navigate = useNavigate()
  const { data: repositories, isLoading, error } = useRepositories()
  const deleteRepository = useDeleteRepository()
  const [taskModalRepo, setTaskModalRepo] = useState<Repository | null>(null)
  const { openInTerminal } = useOpenInTerminal()

  const handleDelete = async (id: string) => {
    await deleteRepository.mutateAsync(id)
  }

  const handleViewTasks = (repoName: string) => {
    navigate({ to: '/tasks', search: { repo: repoName } })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
        <AddRepositoryButton />
        <NewProjectDialog />
      </div>

      <div className="flex-1 overflow-auto p-4">
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

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {repositories?.map((repo) => (
            <RepositoryCard
              key={repo.id}
              repository={repo}
              onDelete={() => handleDelete(repo.id)}
              onStartTask={() => setTaskModalRepo(repo)}
              onOpenInTerminal={() => openInTerminal(repo.path, repo.displayName)}
              onViewTasks={() => handleViewTasks(repo.displayName)}
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
