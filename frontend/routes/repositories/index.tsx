import { useState, useMemo } from 'react'
import { createFileRoute, Link, useNavigate, redirect } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { fuzzyScore } from '@/lib/fuzzy-search'
import {
  useRepositories,
  useDeleteRepository,
} from '@/hooks/use-repositories'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Delete02Icon,
  PackageAddIcon,
  TaskAdd01Icon,
  Folder01Icon,
  Loading03Icon,
  Alert02Icon,
  VisualStudioCodeIcon,
  ComputerTerminal01Icon,
  GridViewIcon,
  Search01Icon,
  Rocket01Icon,
} from '@hugeicons/core-free-icons'
import { useEditorApp, useEditorHost, useEditorSshPort } from '@/hooks/use-config'
import { useAppByRepository, useFindCompose } from '@/hooks/use-apps'
import { toast } from 'sonner'
import { useOpenInTerminal } from '@/hooks/use-open-in-terminal'
import { buildEditorUrl, getEditorDisplayName, openExternalUrl } from '@/lib/editor-url'
import type { Repository } from '@/types'
import { CreateTaskModal } from '@/components/kanban/create-task-modal'
import { AddRepositoryDialog } from '@/components/repositories/add-repository-dialog'
import { DeleteRepositoryDialog } from '@/components/repositories/delete-repository-dialog'
import { Input } from '@/components/ui/input'

export const Route = createFileRoute('/repositories/')({
  component: RepositoriesView,
  beforeLoad: () => {
    // Redirect to projects - repositories are now managed within projects
    throw redirect({ to: '/projects' })
  },
})

function RepositoryCard({
  repository,
  onStartTask,
  onOpenInTerminal,
  onViewTasks,
  onDeleteClick,
}: {
  repository: Repository
  onStartTask: () => void
  onOpenInTerminal: () => void
  onViewTasks: () => void
  onDeleteClick: () => void
}) {
  const { t } = useTranslation('repositories')
  const navigate = useNavigate()
  const { data: editorApp } = useEditorApp()
  const { data: editorHost } = useEditorHost()
  const { data: editorSshPort } = useEditorSshPort()
  const linkedApp = useAppByRepository(repository.id)
  const { data: composeInfo, isLoading: composeLoading } = useFindCompose(repository.id)

  const handleOpenEditor = () => {
    const url = buildEditorUrl(repository.path, editorApp, editorHost, editorSshPort)
    openExternalUrl(url)
  }

  const handleCreateApp = () => {
    if (composeLoading) return
    if (!composeInfo?.found) {
      toast.error(t('createAppDialog.title'), {
        description: t('createAppDialog.description'),
      })
    } else {
      navigate({ to: '/apps/new', search: { repoId: repository.id } })
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

          {/* App - hidden on mobile */}
          {linkedApp ? (
            <Link to="/apps" search={{ repo: repository.displayName }}>
              <Button
                variant="outline"
                size="sm"
                className="text-muted-foreground hover:text-foreground max-sm:hidden"
              >
                <HugeiconsIcon icon={Rocket01Icon} size={14} strokeWidth={2} data-slot="icon" />
                <span>{t('applications')}</span>
              </Button>
            </Link>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground hover:text-foreground max-sm:hidden"
              onClick={handleCreateApp}
              disabled={composeLoading}
            >
              <HugeiconsIcon icon={Rocket01Icon} size={14} strokeWidth={2} data-slot="icon" />
              <span>{t('createApp')}</span>
            </Button>
          )}

          {/* Delete */}
          <Button
            variant="outline"
            size="sm"
            onClick={onDeleteClick}
            className="text-muted-foreground hover:text-destructive"
            title={t('delete.button')}
          >
            <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">{t('delete.button')}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function AddRepositoryButton() {
  const { t } = useTranslation('repositories')
  const navigate = useNavigate()
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <Button size="sm" onClick={() => setDialogOpen(true)}>
        <HugeiconsIcon icon={PackageAddIcon} size={16} strokeWidth={2} data-slot="icon" />
        <span className="max-sm:hidden">{t('addRepository')}</span>
      </Button>

      <AddRepositoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={(repoId) => {
          navigate({ to: '/repositories/$repoId', params: { repoId } })
        }}
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
  const [deleteRepo, setDeleteRepo] = useState<Repository | null>(null)
  const { openInTerminal } = useOpenInTerminal()
  const [searchQuery, setSearchQuery] = useState('')

  const filteredRepositories = useMemo(() => {
    if (!repositories) return []
    if (!searchQuery?.trim()) return repositories
    return repositories
      .map((repo) => ({
        repo,
        score: Math.max(
          fuzzyScore(repo.displayName, searchQuery),
          fuzzyScore(repo.path, searchQuery)
        ),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ repo }) => repo)
  }, [repositories, searchQuery])

  const handleDelete = async (deleteDirectory: boolean) => {
    if (!deleteRepo) return
    await deleteRepository.mutateAsync({ id: deleteRepo.id, deleteDirectory })
  }

  const handleViewTasks = (repoName: string) => {
    navigate({ to: '/tasks', search: { repo: repoName } })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
        <div className="relative min-w-0 flex-1 sm:max-w-64 sm:flex-none">
          <HugeiconsIcon icon={Search01Icon} size={12} strokeWidth={2} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full pl-6"
          />
        </div>
        <div className="hidden sm:block flex-1" />
        <AddRepositoryButton />
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

        {!isLoading && !error && repositories && repositories.length > 0 && filteredRepositories.length === 0 && (
          <div className="py-12 text-muted-foreground">
            <p className="text-sm">
              {t('empty.noMatches')}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredRepositories.map((repo) => (
            <RepositoryCard
              key={repo.id}
              repository={repo}
              onStartTask={() => setTaskModalRepo(repo)}
              onOpenInTerminal={() => openInTerminal(repo.path, repo.displayName)}
              onViewTasks={() => handleViewTasks(repo.displayName)}
              onDeleteClick={() => setDeleteRepo(repo)}
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

      <DeleteRepositoryDialog
        repository={deleteRepo}
        open={deleteRepo !== null}
        onOpenChange={(open) => !open && setDeleteRepo(null)}
        onDelete={handleDelete}
      />
    </div>
  )
}
