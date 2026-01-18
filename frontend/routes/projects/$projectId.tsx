import { useState, useEffect, useCallback, useRef } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useProject, useDeleteProject, useAccessProject, useUpdateProject } from '@/hooks/use-projects'
import { useTasks } from '@/hooks/use-tasks'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  Alert02Icon,
  Delete02Icon,
  PencilEdit02Icon,
  ArrowLeft01Icon,
  Cancel01Icon,
  Folder01Icon,
  TaskAdd01Icon,
  VisualStudioCodeIcon,
  Tick02Icon,
  Settings05Icon,
  WindowsOldIcon,
  Rocket01Icon,
  CheckmarkCircle02Icon,
  Task01Icon,
} from '@hugeicons/core-free-icons'
import type { ProjectRepositoryDetails, Task, TaskStatus } from '@/types'
import { toast } from 'sonner'
import { CreateTaskModal } from '@/components/kanban/create-task-modal'
import { useEditorApp, useEditorHost, useEditorSshPort } from '@/hooks/use-config'
import { buildEditorUrl, openExternalUrl } from '@/lib/editor-url'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectDetailView,
})

// Status indicator colors and icons
const STATUS_CONFIG: Record<TaskStatus, { color: string; bgColor: string }> = {
  TO_DO: { color: 'text-muted-foreground', bgColor: 'bg-muted' },
  IN_PROGRESS: { color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  IN_REVIEW: { color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
  DONE: { color: 'text-green-500', bgColor: 'bg-green-500/10' },
  CANCELED: { color: 'text-muted-foreground', bgColor: 'bg-muted' },
}

function RepositoryCard({
  repository,
}: {
  repository: ProjectRepositoryDetails
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

  return (
    <Card className="group transition-colors hover:border-foreground/20">
      <CardContent className="py-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium truncate group-hover:text-primary transition-colors">
              {repository.displayName}
            </h3>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <HugeiconsIcon icon={Folder01Icon} size={12} strokeWidth={2} className="shrink-0" />
              <span className="truncate font-mono">{repository.path}</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenEditor}
            className="text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={VisualStudioCodeIcon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">{t('editor')}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({
              to: '/repositories/$repoId',
              params: { repoId: repository.id },
              search: { tab: 'workspace' },
            })}
            className="text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={WindowsOldIcon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">Workspace</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({
              to: '/repositories/$repoId',
              params: { repoId: repository.id },
              search: { tab: 'deploy' },
            })}
            className="text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={Rocket01Icon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">Deploy</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({
              to: '/repositories/$repoId',
              params: { repoId: repository.id },
              search: { tab: 'settings' },
            })}
            className="text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={Settings05Icon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">Settings</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function TaskCard({ task }: { task: Task }) {
  const navigate = useNavigate()
  const { t } = useTranslation('common')
  const statusConfig = STATUS_CONFIG[task.status]

  return (
    <Card
      className="group cursor-pointer transition-colors hover:border-foreground/20"
      onClick={() => navigate({ to: '/tasks/$taskId', params: { taskId: task.id } })}
    >
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          <div className={cn('mt-0.5 rounded-full p-1', statusConfig.bgColor)}>
            {task.status === 'DONE' ? (
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} className={statusConfig.color} />
            ) : (
              <HugeiconsIcon icon={Task01Icon} size={12} className={statusConfig.color} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
              {task.title}
            </h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">
                {t(`statuses.${task.status}`)}
              </span>
              {task.labels.length > 0 && (
                <div className="flex gap-1">
                  {task.labels.slice(0, 2).map((label) => (
                    <Badge key={label} variant="secondary" className="text-xs px-1.5 py-0">
                      {label}
                    </Badge>
                  ))}
                  {task.labels.length > 2 && (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">
                      +{task.labels.length - 2}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ProjectDetailView() {
  const { t } = useTranslation('projects')
  const { projectId } = Route.useParams()
  const navigate = useNavigate()
  const { data: project, isLoading, error } = useProject(projectId)
  const { data: allTasks = [] } = useTasks()
  const deleteProject = useDeleteProject()
  const accessProject = useAccessProject()
  const updateProject = useUpdateProject()

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Update last accessed when viewing project
  useEffect(() => {
    if (projectId) {
      accessProject.mutate(projectId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // Filter tasks for this project
  const projectTasks = allTasks.filter((task) => task.projectId === projectId)
  const activeTasks = projectTasks.filter((task) => task.status !== 'DONE' && task.status !== 'CANCELED')
  const completedTasks = projectTasks.filter((task) => task.status === 'DONE' || task.status === 'CANCELED')

  const handleStartEditName = useCallback(() => {
    if (project) {
      setEditedName(project.name)
      setIsEditingName(true)
      setTimeout(() => nameInputRef.current?.select(), 0)
    }
  }, [project])

  const handleSaveName = useCallback(() => {
    const trimmedName = editedName.trim()
    if (trimmedName && trimmedName !== project?.name) {
      updateProject.mutate({ id: projectId, updates: { name: trimmedName } })
    }
    setIsEditingName(false)
  }, [editedName, project?.name, projectId, updateProject])

  const handleCancelEditName = useCallback(() => {
    setIsEditingName(false)
    setEditedName('')
  }, [])

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveName()
    } else if (e.key === 'Escape') {
      handleCancelEditName()
    }
  }, [handleSaveName, handleCancelEditName])

  const handleDelete = async () => {
    try {
      await deleteProject.mutateAsync({
        id: projectId,
        deleteDirectory: false,
        deleteApp: false,
      })
      toast.success(t('delete.success'))
      navigate({ to: '/projects' })
    } catch (err) {
      toast.error(t('delete.error'), {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <HugeiconsIcon icon={Loading03Icon} size={24} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <HugeiconsIcon icon={Alert02Icon} size={24} className="text-destructive" />
        <p className="text-sm text-muted-foreground">{t('notFound')}</p>
        <Link to="/projects">
          <Button variant="outline" size="sm">
            {t('backToProjects')}
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
        <Link to="/projects">
          <Button variant="ghost" size="sm">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} data-slot="icon" />
            <span className="max-sm:hidden">{t('backToProjects')}</span>
          </Button>
        </Link>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setTaskModalOpen(true)}>
          <HugeiconsIcon icon={TaskAdd01Icon} size={14} data-slot="icon" />
          <span className="max-sm:hidden">{t('createTask')}</span>
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-8">
          {/* Project Header */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {isEditingName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      ref={nameInputRef}
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onKeyDown={handleNameKeyDown}
                      onBlur={handleSaveName}
                      className="text-xl font-semibold h-auto py-1"
                      autoFocus
                    />
                    <Button variant="ghost" size="sm" onClick={handleSaveName}>
                      <HugeiconsIcon icon={Tick02Icon} size={16} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleCancelEditName}>
                      <HugeiconsIcon icon={Cancel01Icon} size={16} />
                    </Button>
                  </div>
                ) : (
                  <h1
                    className="text-xl font-semibold cursor-pointer hover:text-primary transition-colors"
                    onClick={handleStartEditName}
                  >
                    {project.name}
                  </h1>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleStartEditName}>
                  <HugeiconsIcon icon={PencilEdit02Icon} size={16} data-slot="icon" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-destructive hover:text-destructive"
                >
                  <HugeiconsIcon icon={Delete02Icon} size={16} data-slot="icon" />
                </Button>
              </div>
            </div>

            {/* Labels */}
            {project.labels && project.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {project.labels.map((label) => (
                  <Badge key={label.id} variant="secondary">
                    {label.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Repositories Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Repositories ({project.repositories.length})
              </h2>
            </div>
            {project.repositories.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground">
                  <p className="text-sm">No repositories linked to this project.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {project.repositories.map((repo) => (
                  <RepositoryCard key={repo.id} repository={repo} />
                ))}
              </div>
            )}
          </section>

          {/* Active Tasks Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Active Tasks ({activeTasks.length})
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setTaskModalOpen(true)}>
                <HugeiconsIcon icon={TaskAdd01Icon} size={14} data-slot="icon" />
                New Task
              </Button>
            </div>
            {activeTasks.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground">
                  <p className="text-sm">No active tasks.</p>
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-2"
                    onClick={() => setTaskModalOpen(true)}
                  >
                    Create a task
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeTasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </div>
            )}
          </section>

          {/* Completed Tasks Section */}
          {completedTasks.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Completed ({completedTasks.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {completedTasks.slice(0, 6).map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </div>
              {completedTasks.length > 6 && (
                <p className="text-sm text-muted-foreground text-center">
                  And {completedTasks.length - 6} more completed tasks...
                </p>
              )}
            </section>
          )}
        </div>
      </ScrollArea>

      {/* Task creation modal */}
      <CreateTaskModal
        open={taskModalOpen}
        onOpenChange={setTaskModalOpen}
        defaultRepository={project.repositories[0]}
        showTrigger={false}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete.confirmText', { name: project.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('delete.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              {t('delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
