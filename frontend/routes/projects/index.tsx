import { useState, useMemo } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { fuzzyScore } from '@/lib/fuzzy-search'
import { useProjects, useDeleteProject } from '@/hooks/use-projects'
import { useDeployApp, useStopApp } from '@/hooks/use-apps'
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
  Search01Icon,
  PlayIcon,
  StopIcon,
} from '@hugeicons/core-free-icons'
import { useEditorApp, useEditorHost, useEditorSshPort } from '@/hooks/use-config'
import { toast } from 'sonner'
import { useOpenInTerminal } from '@/hooks/use-open-in-terminal'
import { buildEditorUrl, getEditorDisplayName, openExternalUrl } from '@/lib/editor-url'
import type { ProjectWithDetails } from '@/types'
import { CreateTaskModal } from '@/components/kanban/create-task-modal'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
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

export const Route = createFileRoute('/projects/')({
  component: ProjectsView,
})

function getStatusColor(status: string | undefined): string {
  switch (status) {
    case 'running':
      return 'bg-green-500'
    case 'building':
      return 'bg-yellow-500'
    case 'failed':
      return 'bg-red-500'
    default:
      return 'bg-muted-foreground/30'
  }
}

function getStatusText(status: string | undefined, t: (key: string) => string): string {
  switch (status) {
    case 'running':
      return t('card.running')
    case 'building':
      return t('card.building')
    case 'failed':
      return t('card.failed')
    case 'stopped':
      return t('card.stopped')
    default:
      return t('card.noApp')
  }
}

function ProjectCard({
  project,
  onStartTask,
  onOpenInTerminal,
  onDeleteClick,
}: {
  project: ProjectWithDetails
  onStartTask: () => void
  onOpenInTerminal: () => void
  onDeleteClick: () => void
}) {
  const { t } = useTranslation('projects')
  const navigate = useNavigate()
  const { data: editorApp } = useEditorApp()
  const { data: editorHost } = useEditorHost()
  const { data: editorSshPort } = useEditorSshPort()
  const deployApp = useDeployApp()
  const stopApp = useStopApp()

  const hasApp = !!project.app
  const appStatus = project.app?.status
  const isRunning = appStatus === 'running'
  const isBuilding = appStatus === 'building'
  const repoPath = project.repository?.path

  // Get primary domain from services
  const primaryDomain = project.app?.services?.find((s) => s.exposed && s.domain)?.domain

  const handleOpenEditor = () => {
    if (!repoPath) {
      toast.error('No repository path')
      return
    }
    const url = buildEditorUrl(repoPath, editorApp, editorHost, editorSshPort)
    openExternalUrl(url)
  }

  const handleDeploy = async () => {
    if (!project.app) return
    try {
      await deployApp.mutateAsync(project.app.id)
      navigate({ to: '/projects/$projectId', params: { projectId: project.id }, search: { tab: 'deployments' } })
    } catch (err) {
      toast.error('Deploy failed', { description: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  const handleStop = async () => {
    if (!project.app) return
    try {
      await stopApp.mutateAsync(project.app.id)
    } catch (err) {
      toast.error('Stop failed', { description: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  return (
    <Card className="h-full group transition-colors hover:border-foreground/20">
      <Link to="/projects/$projectId" params={{ projectId: project.id }} className="block">
        <CardContent className="flex flex-col gap-3 py-4">
          {/* Header: Status dot + Name */}
          <div className="flex items-center gap-2">
            <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', getStatusColor(appStatus))} />
            <span className="truncate font-medium group-hover:text-primary transition-colors">
              {project.name}
            </span>
          </div>

          {/* Path */}
          {repoPath && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <HugeiconsIcon icon={Folder01Icon} size={12} strokeWidth={2} className="shrink-0" />
              <span className="truncate font-mono">{repoPath}</span>
            </div>
          )}

          {/* App status / domain */}
          <div className="flex items-center gap-2 text-xs">
            {hasApp ? (
              <>
                <span className="text-muted-foreground">
                  App: {getStatusText(appStatus, t)}
                </span>
                {primaryDomain && (
                  <span className="text-muted-foreground truncate">
                    {primaryDomain}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">{t('card.noApp')}</span>
            )}
          </div>
        </CardContent>
      </Link>

      <CardContent className="pt-0 pb-4 px-6">
        {/* Action buttons row */}
        <div className="mt-auto flex flex-wrap gap-1">
          {/* New Task */}
          {project.repository && (
            <Button
              variant="outline"
              size="sm"
              onClick={onStartTask}
              className="text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={TaskAdd01Icon} size={14} strokeWidth={2} data-slot="icon" />
              <span className="max-sm:hidden">{t('newTask')}</span>
            </Button>
          )}

          {/* Terminal */}
          {repoPath && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenInTerminal}
              className="text-muted-foreground hover:text-foreground"
              title="Open in Terminal"
            >
              <HugeiconsIcon icon={ComputerTerminal01Icon} size={14} strokeWidth={2} data-slot="icon" />
              <span className="max-sm:hidden">{t('terminal')}</span>
            </Button>
          )}

          {/* Editor - hidden on mobile */}
          {repoPath && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenEditor}
              className="text-muted-foreground hover:text-foreground max-sm:hidden"
              title={`Open in ${getEditorDisplayName(editorApp)}`}
            >
              <HugeiconsIcon icon={VisualStudioCodeIcon} size={14} strokeWidth={2} data-slot="icon" />
              <span>{t('editor')}</span>
            </Button>
          )}

          {/* Deploy / Stop */}
          {hasApp && (
            <>
              {isRunning ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStop}
                  disabled={stopApp.isPending}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <HugeiconsIcon icon={StopIcon} size={14} strokeWidth={2} data-slot="icon" />
                  <span className="max-sm:hidden">{t('stop')}</span>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeploy}
                  disabled={deployApp.isPending || isBuilding}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {isBuilding ? (
                    <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" data-slot="icon" />
                  ) : (
                    <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={2} data-slot="icon" />
                  )}
                  <span className="max-sm:hidden">{t('deploy')}</span>
                </Button>
              )}
            </>
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

function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
  onDelete,
}: {
  project: ProjectWithDetails | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (deleteRepository: boolean, deleteApp: boolean) => Promise<void>
}) {
  const { t } = useTranslation('projects')
  const [deleteRepository, setDeleteRepository] = useState(false)
  const [deleteApp, setDeleteApp] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await onDelete(deleteRepository, deleteApp)
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
                id="deleteRepository"
                checked={deleteRepository}
                onCheckedChange={(checked) => setDeleteRepository(checked === true)}
              />
              <Label htmlFor="deleteRepository" className="text-sm">
                {t('delete.alsoDeleteRepository')}
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
  const { data: projects, isLoading, error } = useProjects()
  const deleteProject = useDeleteProject()
  const [taskModalProject, setTaskModalProject] = useState<ProjectWithDetails | null>(null)
  const [deleteProjectState, setDeleteProjectState] = useState<ProjectWithDetails | null>(null)
  const { openInTerminal } = useOpenInTerminal()
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

  const handleDelete = async (deleteRepository: boolean, deleteApp: boolean) => {
    if (!deleteProjectState) return
    await deleteProject.mutateAsync({
      id: deleteProjectState.id,
      deleteRepository,
      deleteApp,
    })
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
        <Button size="sm" onClick={() => navigate({ to: '/projects/new' })}>
          <HugeiconsIcon icon={PackageAddIcon} size={16} strokeWidth={2} data-slot="icon" />
          <span className="max-sm:hidden">{t('newProject')}</span>
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
            <span className="text-sm">{t('error.failedToLoad', { message: error.message })}</span>
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
              onStartTask={() => setTaskModalProject(project)}
              onOpenInTerminal={() => {
                if (project.repository?.path) {
                  openInTerminal(project.repository.path, project.name)
                }
              }}
              onDeleteClick={() => setDeleteProjectState(project)}
            />
          ))}
        </div>
      </div>

      {taskModalProject?.repository && (
        <CreateTaskModal
          open={taskModalProject !== null}
          onOpenChange={(open) => !open && setTaskModalProject(null)}
          defaultRepository={{
            id: taskModalProject.repository.id,
            path: taskModalProject.repository.path,
            displayName: taskModalProject.repository.displayName,
            startupScript: taskModalProject.repository.startupScript,
            copyFiles: taskModalProject.repository.copyFiles,
            claudeOptions: taskModalProject.repository.claudeOptions,
            opencodeOptions: taskModalProject.repository.opencodeOptions,
            opencodeModel: taskModalProject.repository.opencodeModel,
            defaultAgent: taskModalProject.repository.defaultAgent,
            remoteUrl: taskModalProject.repository.remoteUrl,
            isCopierTemplate: taskModalProject.repository.isCopierTemplate,
            createdAt: '',
            updatedAt: '',
          }}
          showTrigger={false}
        />
      )}

      <DeleteProjectDialog
        project={deleteProjectState}
        open={deleteProjectState !== null}
        onOpenChange={(open) => !open && setDeleteProjectState(null)}
        onDelete={handleDelete}
      />
    </div>
  )
}
