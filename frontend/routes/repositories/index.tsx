import { useState, useMemo } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { fuzzyScore } from '@/lib/fuzzy-search'
import { useRepositories, useDeleteRepository } from '@/hooks/use-repositories'
import { useProjects } from '@/hooks/use-projects'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Delete02Icon,
  Folder01Icon,
  Loading03Icon,
  Alert02Icon,
  VisualStudioCodeIcon,
  Search01Icon,
  Settings05Icon,
} from '@hugeicons/core-free-icons'
import { useEditorApp, useEditorHost, useEditorSshPort } from '@/hooks/use-config'
import { toast } from 'sonner'
import { buildEditorUrl, getEditorDisplayName, openExternalUrl } from '@/lib/editor-url'
import type { Repository, ProjectWithDetails } from '@/types'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'

export const Route = createFileRoute('/repositories/')({
  component: RepositoriesView,
})

function RepositoryCard({
  repository,
  project,
  onDeleteClick,
}: {
  repository: Repository
  project: ProjectWithDetails | null
  onDeleteClick: () => void
}) {
  const { t } = useTranslation('projects')
  const navigate = useNavigate()
  const { data: editorApp } = useEditorApp()
  const { data: editorHost } = useEditorHost()
  const { data: editorSshPort } = useEditorSshPort()

  const handleOpenEditor = () => {
    const url = buildEditorUrl(repository.path, editorApp, editorHost, editorSshPort)
    openExternalUrl(url)
  }

  // If repo has a project, link to project detail; otherwise link to repository detail
  const detailLink = project
    ? { to: '/projects/$projectId' as const, params: { projectId: project.id } }
    : { to: '/repositories/$repoId' as const, params: { repoId: repository.id } }

  return (
    <Card className="h-full group transition-colors hover:border-foreground/20">
      <Link {...detailLink} className="block">
        <CardContent className="flex flex-col gap-3 py-4">
          {/* Header: Name */}
          <div className="flex items-center gap-2">
            <span className="truncate font-medium group-hover:text-primary transition-colors">
              {repository.displayName}
            </span>
          </div>

          {/* Path */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <HugeiconsIcon icon={Folder01Icon} size={12} strokeWidth={2} className="shrink-0" />
            <span className="truncate font-mono">{repository.path}</span>
          </div>

          {/* Project association */}
          <div className="flex items-center gap-2 text-xs">
            {project ? (
              <Badge variant="secondary" className="text-xs">
                Project: {project.name}
              </Badge>
            ) : (
              <span className="text-muted-foreground">No project</span>
            )}
          </div>
        </CardContent>
      </Link>

      <CardContent className="pt-0 pb-4 px-6">
        {/* Action buttons row */}
        <div className="mt-auto flex flex-wrap gap-1">
          {/* Editor */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenEditor}
            className="text-muted-foreground hover:text-foreground"
            title={`Open in ${getEditorDisplayName(editorApp)}`}
          >
            <HugeiconsIcon icon={VisualStudioCodeIcon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">{t('editor')}</span>
          </Button>

          {/* Settings */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(detailLink)}
            className="text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={Settings05Icon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">Settings</span>
          </Button>

          {/* Delete - only if no project */}
          {!project && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDeleteClick}
              className="text-muted-foreground hover:text-destructive"
              title="Delete repository"
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} data-slot="icon" />
              <span className="max-sm:hidden">{t('delete.button')}</span>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function DeleteRepositoryDialog({
  repository,
  open,
  onOpenChange,
  onDelete,
}: {
  repository: Repository | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: () => Promise<void>
}) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await onDelete()
      onOpenChange(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Repository</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove &quot;{repository?.displayName}&quot; from the repository list?
            This will not delete the actual directory.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
            {isDeleting ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RepositoriesView() {
  const { data: repositories, isLoading, error } = useRepositories()
  const { data: projects } = useProjects()
  const deleteRepository = useDeleteRepository()
  const [deleteRepoState, setDeleteRepoState] = useState<Repository | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Build a map from repository ID to project
  const repoToProject = useMemo(() => {
    const map = new Map<string, ProjectWithDetails>()
    if (projects) {
      for (const project of projects) {
        // Check repositories array first
        for (const repo of project.repositories) {
          map.set(repo.id, project)
        }
        // Fallback to legacy repositoryId
        if (project.repositoryId && !map.has(project.repositoryId)) {
          map.set(project.repositoryId, project)
        }
      }
    }
    return map
  }, [projects])

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

  const handleDelete = async () => {
    if (!deleteRepoState) return
    try {
      await deleteRepository.mutateAsync(deleteRepoState.id)
      toast.success('Repository removed')
    } catch (err) {
      toast.error('Failed to delete repository', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
        <div className="relative min-w-0 flex-1 sm:max-w-64 sm:flex-none">
          <HugeiconsIcon icon={Search01Icon} size={12} strokeWidth={2} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search repositories..."
            className="w-full pl-6"
          />
        </div>
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
            <span className="text-sm">Failed to load repositories: {error.message}</span>
          </div>
        )}

        {!isLoading && !error && repositories?.length === 0 && (
          <div className="py-12 text-muted-foreground">
            <p className="text-sm">No repositories found</p>
          </div>
        )}

        {!isLoading && !error && repositories && repositories.length > 0 && filteredRepositories.length === 0 && (
          <div className="py-12 text-muted-foreground">
            <p className="text-sm">No repositories match your search</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredRepositories.map((repo) => (
            <RepositoryCard
              key={repo.id}
              repository={repo}
              project={repoToProject.get(repo.id) ?? null}
              onDeleteClick={() => setDeleteRepoState(repo)}
            />
          ))}
        </div>
      </div>

      <DeleteRepositoryDialog
        repository={deleteRepoState}
        open={deleteRepoState !== null}
        onOpenChange={(open) => !open && setDeleteRepoState(null)}
        onDelete={handleDelete}
      />
    </div>
  )
}
