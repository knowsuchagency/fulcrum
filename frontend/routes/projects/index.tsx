import { useState, useMemo } from 'react'
import { createFileRoute, Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { fuzzyScore } from '@/lib/fuzzy-search'
import { useProjects, useDeleteProject } from '@/hooks/use-projects'
import { useRepositories, useDeleteRepository } from '@/hooks/use-repositories'
import { useEditorApp, useEditorHost, useEditorSshPort } from '@/hooks/use-config'
import { buildEditorUrl, getEditorDisplayName, openExternalUrl } from '@/lib/editor-url'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Delete02Icon,
  PackageAddIcon,
  TaskAdd01Icon,
  Folder01Icon,
  Loading03Icon,
  Alert02Icon,
  Search01Icon,
  TaskDaily01Icon,
  SourceCodeSquareIcon,
  VisualStudioCodeIcon,
  Settings05Icon,
} from '@hugeicons/core-free-icons'
import type { ProjectWithDetails, Repository } from '@/types'
import { CreateTaskModal } from '@/components/kanban/create-task-modal'
import { Badge } from '@/components/ui/badge'
import { CreateProjectModal } from '@/components/projects/create-project-modal'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

type ViewTab = 'projects' | 'repositories'

interface ProjectsSearchParams {
  tab?: ViewTab
}

export const Route = createFileRoute('/projects/')({
  validateSearch: (search: Record<string, unknown>): ProjectsSearchParams => ({
    tab: search.tab === 'repositories' ? 'repositories' : undefined,
  }),
  component: ProjectsView,
})

function ProjectCard({
  project,
  onStartTask,
  onAddRepo,
  onDeleteClick,
}: {
  project: ProjectWithDetails
  onStartTask: () => void
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

          {/* Add Repo */}
          <Button
            variant="outline"
            size="sm"
            onClick={onAddRepo}
            className="text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">{t('addRepo')}</span>
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
        <CardContent className="flex flex-col items-start gap-3 py-4">
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

      <CardContent className="flex flex-col items-start pt-0 pb-4">
        {/* Action buttons row */}
        <div className="flex flex-wrap gap-1">
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

function ProjectsView() {
  const { t } = useTranslation('projects')
  const navigate = useNavigate()
  const searchParams = useSearch({ from: '/projects/' }) as ProjectsSearchParams
  const activeTab = searchParams.tab ?? 'projects'

  // Projects data
  const { data: projects, isLoading: projectsLoading, error: projectsError } = useProjects()
  const deleteProject = useDeleteProject()
  const [taskModalProject, setTaskModalProject] = useState<ProjectWithDetails | null>(null)
  const [deleteProjectState, setDeleteProjectState] = useState<ProjectWithDetails | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)

  // Repositories data
  const { data: repositories, isLoading: reposLoading, error: reposError } = useRepositories()
  const deleteRepository = useDeleteRepository()
  const [deleteRepoState, setDeleteRepoState] = useState<Repository | null>(null)

  const [searchQuery, setSearchQuery] = useState('')

  // Build a map from repository ID to project (for repo view)
  const repoToProject = useMemo(() => {
    const map = new Map<string, ProjectWithDetails>()
    if (projects) {
      for (const project of projects) {
        for (const repo of project.repositories) {
          map.set(repo.id, project)
        }
        if (project.repositoryId && !map.has(project.repositoryId)) {
          map.set(project.repositoryId, project)
        }
      }
    }
    return map
  }, [projects])

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

  const handleDeleteProject = async (deleteDirectory: boolean, deleteApp: boolean) => {
    if (!deleteProjectState) return
    await deleteProject.mutateAsync({
      id: deleteProjectState.id,
      deleteDirectory,
      deleteApp,
    })
  }

  const handleDeleteRepository = async () => {
    if (!deleteRepoState) return
    try {
      await deleteRepository.mutateAsync({ id: deleteRepoState.id })
      toast.success('Repository removed')
    } catch (err) {
      toast.error('Failed to delete repository', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  const handleTabChange = (value: string | string[]) => {
    const selected = Array.isArray(value) ? value[0] : value
    if (selected === 'repositories') {
      navigate({ to: '/projects', search: { tab: 'repositories' } })
    } else {
      navigate({ to: '/projects', search: {} })
    }
  }

  const isLoading = activeTab === 'projects' ? projectsLoading : reposLoading
  const error = activeTab === 'projects' ? projectsError : reposError

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
        <div className="relative min-w-0 flex-1 sm:max-w-64 sm:flex-none">
          <HugeiconsIcon icon={Search01Icon} size={12} strokeWidth={2} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'projects' ? t('searchPlaceholder') : 'Search repositories...'}
            className="w-full pl-6"
          />
        </div>
        <div className="hidden sm:block flex-1" />
        {/* Projects/Repos toggle */}
        <ToggleGroup
          value={[activeTab]}
          onValueChange={handleTabChange}
          className="hidden sm:flex"
          variant="outline"
        >
          <ToggleGroupItem value="projects" aria-label="View projects" className="gap-1.5 text-xs">
            <HugeiconsIcon icon={TaskDaily01Icon} size={14} strokeWidth={2} />
            Projects
          </ToggleGroupItem>
          <ToggleGroupItem value="repositories" aria-label="View repositories" className="gap-1.5 text-xs">
            <HugeiconsIcon icon={SourceCodeSquareIcon} size={14} strokeWidth={2} />
            Repos
          </ToggleGroupItem>
        </ToggleGroup>
        {activeTab === 'projects' && (
          <Button size="sm" onClick={() => setCreateModalOpen(true)}>
            <HugeiconsIcon icon={PackageAddIcon} size={16} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">{t('newProjectButton')}</span>
          </Button>
        )}
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
              {activeTab === 'projects'
                ? t('error.failedToLoad', { message: error.message })
                : `Failed to load repositories: ${error.message}`}
            </span>
          </div>
        )}

        {/* Projects view */}
        {activeTab === 'projects' && (
          <>
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
                  onStartTask={() => setTaskModalProject(project)}
                  onAddRepo={() => navigate({ to: '/projects/$projectId', params: { projectId: project.id } })}
                  onDeleteClick={() => setDeleteProjectState(project)}
                />
              ))}
            </div>
          </>
        )}

        {/* Repositories view */}
        {activeTab === 'repositories' && (
          <>
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
          </>
        )}
      </div>

      {taskModalProject && (
        <CreateTaskModal
          open={taskModalProject !== null}
          onOpenChange={(open) => !open && setTaskModalProject(null)}
          defaultRepository={taskModalProject.repositories[0] ?? taskModalProject.repository ?? undefined}
          showTrigger={false}
        />
      )}

      <DeleteProjectDialog
        project={deleteProjectState}
        open={deleteProjectState !== null}
        onOpenChange={(open) => !open && setDeleteProjectState(null)}
        onDelete={handleDeleteProject}
      />

      <DeleteRepositoryDialog
        repository={deleteRepoState}
        open={deleteRepoState !== null}
        onOpenChange={(open) => !open && setDeleteRepoState(null)}
        onDelete={handleDeleteRepository}
      />

      <CreateProjectModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
      />
    </div>
  )
}
