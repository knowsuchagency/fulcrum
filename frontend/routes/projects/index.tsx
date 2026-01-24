import { useState, useMemo } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { fuzzyScore } from '@/lib/fuzzy-search'
import { useProjects, useDeleteProject } from '@/hooks/use-projects'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Delete02Icon,
  PackageAddIcon,
  Folder01Icon,
  FolderAddIcon,
  Loading03Icon,
  Alert02Icon,
  Search01Icon,
  TaskDaily01Icon,
  CopyLinkIcon,
} from '@hugeicons/core-free-icons'
import type { ProjectWithDetails } from '@/types'
import { Badge } from '@/components/ui/badge'
import { CreateProjectModalSimple } from '@/components/projects/create-project-modal-simple'
import { AddRepositoryModal } from '@/components/projects/add-repository-modal'
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
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

export const Route = createFileRoute('/projects/')({
  component: ProjectsView,
})

function ProjectCard({
  project,
  onAddRepo,
  onDeleteClick,
}: {
  project: ProjectWithDetails
  onAddRepo: () => void
  onDeleteClick: () => void
}) {
  const { t } = useTranslation('projects')

  // Get repo count - use repositories array if available, otherwise count legacy repositoryId
  const repoCount = project.repositories.length > 0
    ? project.repositories.length
    : project.repositoryId ? 1 : 0

  return (
    <Card className="h-full group transition-colors hover:border-foreground/20">
      <Link to="/projects/$projectId" params={{ projectId: project.id }} className="block">
        <CardContent className="flex flex-col items-start gap-3 py-4">
          {/* Project Name */}
          <span className="truncate font-medium group-hover:text-primary transition-colors">
            {project.name}
          </span>

          {/* Description */}
          {project.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {project.description}
            </p>
          )}

          {/* Tags */}
          {project.tags && project.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {project.tags.slice(0, 3).map((tag) => (
                <Badge
                  key={tag.id}
                  variant="default"
                  className="text-[10px] px-1.5 py-0"
                  style={tag.color ? { backgroundColor: tag.color, color: '#fff' } : undefined}
                >
                  {tag.name}
                </Badge>
              ))}
              {project.tags.length > 3 && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0">
                  +{project.tags.length - 3}
                </Badge>
              )}
            </div>
          )}

          {/* Repo count and task count */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={2} className="shrink-0 -translate-y-px" />
              <span>{repoCount} {repoCount === 1 ? 'repository' : 'repositories'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <HugeiconsIcon icon={TaskDaily01Icon} size={14} strokeWidth={2} className="shrink-0 -translate-y-px" />
              <span>{project.taskCount ?? 0} active {project.taskCount === 1 ? 'task' : 'tasks'}</span>
            </div>
          </div>
        </CardContent>
      </Link>

      <CardContent className="flex flex-col items-start pt-0 pb-4">
        {/* Action buttons row */}
        <div className="flex flex-wrap gap-1">
          {/* Link Repo */}
          <Button
            variant="outline"
            size="sm"
            onClick={onAddRepo}
            className="text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={CopyLinkIcon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">{t('linkRepo')}</span>
          </Button>

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

function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
  onDelete,
}: {
  project: ProjectWithDetails | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (deleteDirectory: boolean, deleteApp: boolean) => Promise<void>
}) {
  const { t } = useTranslation('projects')
  const [deleteDirectory, setDeleteDirectory] = useState(false)
  const [deleteApp, setDeleteApp] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await onDelete(deleteDirectory, deleteApp)
      onOpenChange(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('delete.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('delete.description', { name: project?.name })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          {project && project.repositories.length > 0 && (
            <div className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
              {t('delete.reposWarning', { count: project.repositories.length })}
            </div>
          )}
          {project?.repository && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="deleteDirectory"
                checked={deleteDirectory}
                onCheckedChange={(checked) => setDeleteDirectory(checked === true)}
              />
              <Label htmlFor="deleteDirectory" className="text-sm">
                {t('delete.alsoDeleteDirectory')}
              </Label>
            </div>
          )}
          {project?.app && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="deleteApp"
                checked={deleteApp}
                onCheckedChange={(checked) => setDeleteApp(checked === true)}
              />
              <Label htmlFor="deleteApp" className="text-sm">
                {t('delete.alsoDeleteApp')}
              </Label>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
            {isDeleting ? t('delete.deleting') : t('delete.button')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ProjectsView() {
  const { t } = useTranslation('projects')
  const navigate = useNavigate()

  // Projects data
  const { data: projects, isLoading, error } = useProjects()
  const deleteProject = useDeleteProject()
  const [deleteProjectState, setDeleteProjectState] = useState<ProjectWithDetails | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)

  // Add repository modal
  const [addRepoModalOpen, setAddRepoModalOpen] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')

  const filteredProjects = useMemo(() => {
    if (!projects) return []
    if (!searchQuery?.trim()) return projects
    return projects
      .map((project) => ({
        project,
        score: Math.max(
          fuzzyScore(project.name, searchQuery),
          fuzzyScore(project.repository?.path ?? '', searchQuery),
          fuzzyScore(project.repository?.displayName ?? '', searchQuery)
        ),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ project }) => project)
  }, [projects, searchQuery])

  const handleDeleteProject = async (deleteDirectory: boolean, deleteApp: boolean) => {
    if (!deleteProjectState) return
    await deleteProject.mutateAsync({
      id: deleteProjectState.id,
      deleteDirectory,
      deleteApp,
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2" style={{ background: 'var(--gradient-header)' }}>
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
        <Button size="sm" variant="outline" onClick={() => setAddRepoModalOpen(true)}>
          <HugeiconsIcon icon={FolderAddIcon} size={16} strokeWidth={2} data-slot="icon" />
          <span className="max-sm:hidden">{t('addRepo')}</span>
        </Button>
        <Button size="sm" onClick={() => setCreateModalOpen(true)}>
          <HugeiconsIcon icon={PackageAddIcon} size={16} strokeWidth={2} data-slot="icon" />
          <span className="max-sm:hidden">{t('newProjectButton')}</span>
        </Button>
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
            <span className="text-sm">
              {t('error.failedToLoad', { message: error.message })}
            </span>
          </div>
        )}

        {!isLoading && !error && projects?.length === 0 && (
          <div className="py-12 text-muted-foreground">
            <p className="text-sm">{t('empty.noProjects')}</p>
          </div>
        )}

        {!isLoading && !error && projects && projects.length > 0 && filteredProjects.length === 0 && (
          <div className="py-12 text-muted-foreground">
            <p className="text-sm">{t('empty.noMatches')}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onAddRepo={() => navigate({ to: '/projects/$projectId', params: { projectId: project.id }, search: { addRepo: true } })}
              onDeleteClick={() => setDeleteProjectState(project)}
            />
          ))}
        </div>
      </div>

      <DeleteProjectDialog
        project={deleteProjectState}
        open={deleteProjectState !== null}
        onOpenChange={(open) => !open && setDeleteProjectState(null)}
        onDelete={handleDeleteProject}
      />

      <CreateProjectModalSimple
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
      />

      {/* Add Repository Modal */}
      <AddRepositoryModal
        open={addRepoModalOpen}
        onOpenChange={setAddRepoModalOpen}
      />
    </div>
  )
}
