import { useState, useEffect, useCallback, useRef } from 'react'
import { createFileRoute, Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useProject, useDeleteProject, useAccessProject, useUpdateProject } from '@/hooks/use-projects'
import { useTasks } from '@/hooks/use-tasks'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
  Cancel01Icon,
  Folder01Icon,
  FolderAddIcon,
  Tick02Icon,
  Settings05Icon,
  WindowsOldIcon,
  Rocket01Icon,
  CheckmarkCircle02Icon,
  Task01Icon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  Edit02Icon,
  CopyLinkIcon,
  TaskAdd01Icon,
} from '@hugeicons/core-free-icons'
import type { ProjectRepositoryDetails, Task, TaskStatus } from '@/types'
import { toast } from 'sonner'
import { CreateTaskModal } from '@/components/kanban/create-task-modal'
import { cn } from '@/lib/utils'
import { ProjectTagsManager } from '@/components/project/project-tags-manager'
import { ProjectDescriptionEditor } from '@/components/project/project-description-editor'
import { ProjectAttachmentsManager } from '@/components/project/project-attachments-manager'
import { ProjectLinksManager } from '@/components/project/project-links-manager'
import { LinkRepositoriesModal } from '@/components/projects/link-repositories-modal'
import { AddRepositoryModal } from '@/components/projects/add-repository-modal'
import { RemoveRepositoryDialog } from '@/components/projects/remove-repository-dialog'

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
  onRemove,
  onNewTask,
}: {
  repository: ProjectRepositoryDetails
  onRemove: () => void
  onNewTask: () => void
}) {
  const navigate = useNavigate()

  const handleCardClick = () => {
    navigate({
      to: '/repositories/$repoId',
      params: { repoId: repository.id },
      search: { tab: 'settings' },
    })
  }

  return (
    <Card
      className="group transition-colors hover:border-foreground/20 cursor-pointer"
      onClick={handleCardClick}
    >
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
              onClick={(e) => {
                e.stopPropagation()
                onNewTask()
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={TaskAdd01Icon} size={14} strokeWidth={2} data-slot="icon" />
              <span className="max-sm:hidden">New Task</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                navigate({
                  to: '/repositories/$repoId',
                  params: { repoId: repository.id },
                  search: { tab: 'settings' },
                })
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={Settings05Icon} size={14} strokeWidth={2} data-slot="icon" />
              <span className="max-sm:hidden">Task Settings</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                navigate({
                  to: '/repositories/$repoId',
                  params: { repoId: repository.id },
                  search: { tab: 'workspace' },
                })
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={WindowsOldIcon} size={14} strokeWidth={2} data-slot="icon" />
              <span className="max-sm:hidden">Workspace</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                navigate({
                  to: '/repositories/$repoId',
                  params: { repoId: repository.id },
                  search: { tab: 'deploy' },
                })
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={Rocket01Icon} size={14} strokeWidth={2} data-slot="icon" />
              <span className="max-sm:hidden">Deploy</span>
            </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="text-muted-foreground hover:text-destructive"
          >
            <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">Remove</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function TaskRow({ task }: { task: Task }) {
  const navigate = useNavigate()
  const { t } = useTranslation('common')
  const statusConfig = STATUS_CONFIG[task.status]

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors border-b border-border last:border-b-0"
      onClick={() => navigate({ to: '/tasks/$taskId', params: { taskId: task.id } })}
    >
      {/* Status indicator */}
      <div className={cn('shrink-0 rounded-full p-1', statusConfig.bgColor)}>
        {task.status === 'DONE' ? (
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={10} className={statusConfig.color} />
        ) : task.status === 'CANCELED' ? (
          <HugeiconsIcon icon={Cancel01Icon} size={10} className={statusConfig.color} />
        ) : (
          <HugeiconsIcon icon={Task01Icon} size={10} className={statusConfig.color} />
        )}
      </div>

      {/* Title */}
      <span className="flex-1 min-w-0 text-sm truncate hover:text-primary transition-colors">
        {task.title}
      </span>

      {/* Status badge */}
      <Badge variant="secondary" className={cn('shrink-0 text-xs', statusConfig.bgColor, statusConfig.color)}>
        {t(`statuses.${task.status}`)}
      </Badge>

      {/* Repo name if available */}
      {task.repoName && (
        <span className="shrink-0 text-xs text-muted-foreground max-w-24 truncate">
          {task.repoName}
        </span>
      )}
    </div>
  )
}

function ProjectDetailView() {
  const { t } = useTranslation('projects')
  const { projectId } = Route.useParams()
  const location = useRouterState({ select: (s) => s.location })
  const navigate = useNavigate()
  const { data: project, isLoading, error } = useProject(projectId)
  const { data: allTasks = [] } = useTasks()
  const deleteProject = useDeleteProject()
  const accessProject = useAccessProject()
  const updateProject = useUpdateProject()

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [taskModalRepo, setTaskModalRepo] = useState<ProjectRepositoryDetails | null>(null)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Notes editing state
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [editedNotes, setEditedNotes] = useState('')
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Status filter state - multi-select for active statuses
  const [statusFilter, setStatusFilter] = useState<Set<TaskStatus>>(
    new Set(['TO_DO', 'IN_PROGRESS', 'IN_REVIEW'])
  )
  // Archive section collapsed state
  const [archiveOpen, setArchiveOpen] = useState(false)

  // Repository modal states
  const [linkRepoModalOpen, setBulkAddModalOpen] = useState(false)
  const [addRepoModalOpen, setAddRepoModalOpen] = useState(false)
  const [removeRepoDialog, setRemoveRepoDialog] = useState<{
    open: boolean
    repository: ProjectRepositoryDetails | null
  }>({ open: false, repository: null })

  // Handle ?addRepo=true search param (navigate to bulk add)
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const addRepo = params.get('addRepo')
    if (addRepo === 'true' && !linkRepoModalOpen) {
      setBulkAddModalOpen(true)
      // Clear the search param after opening modal
      navigate({ to: '/projects/$projectId', params: { projectId }, replace: true })
    }
  }, [location.search, linkRepoModalOpen, navigate, projectId])

  // Update last accessed when viewing project
  useEffect(() => {
    if (projectId) {
      accessProject.mutate(projectId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // Filter tasks for this project
  // Match by projectId OR by repoPath matching any of the project's repositories
  const projectRepoPaths = project?.repositories.map((r) => r.path) ?? []
  const legacyRepoPath = project?.repository?.path
  if (legacyRepoPath && !projectRepoPaths.includes(legacyRepoPath)) {
    projectRepoPaths.push(legacyRepoPath)
  }
  const projectTasks = allTasks.filter(
    (task) =>
      task.projectId === projectId ||
      (task.repoPath && projectRepoPaths.includes(task.repoPath))
  )

  // Split into active (filterable) and archived (Done/Cancelled)
  const activeTasks = projectTasks.filter(
    (task) => task.status !== 'DONE' && task.status !== 'CANCELED'
  )
  const archivedTasks = projectTasks.filter(
    (task) => task.status === 'DONE' || task.status === 'CANCELED'
  )

  // Apply status filter to active tasks
  const filteredTasks = activeTasks.filter((task) => statusFilter.has(task.status))

  // Toggle a status in the filter
  const toggleStatus = (status: TaskStatus) => {
    setStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(status)) {
        next.delete(status)
      } else {
        next.add(status)
      }
      return next
    })
  }

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

  const handleStartEditNotes = useCallback(() => {
    if (project) {
      setEditedNotes(project.notes || '')
      setIsEditingNotes(true)
      setTimeout(() => notesTextareaRef.current?.focus(), 0)
    }
  }, [project])

  const handleSaveNotes = useCallback(() => {
    const newNotes = editedNotes.trim() || null
    if (newNotes !== (project?.notes || null)) {
      updateProject.mutate({ id: projectId, updates: { notes: newNotes } })
    }
    setIsEditingNotes(false)
  }, [editedNotes, project?.notes, projectId, updateProject])

  const handleCancelEditNotes = useCallback(() => {
    setIsEditingNotes(false)
    setEditedNotes('')
  }, [])

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteProject.mutateAsync({
        id: projectId,
        deleteDirectory: false,
        deleteApp: false,
      })
      toast.success(t('delete.success'))
      setShowDeleteConfirm(false)
      navigate({ to: '/projects' })
    } catch (err) {
      toast.error(t('delete.error'), {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
      setIsDeleting(false)
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
    <>
      <ScrollArea className="h-full">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-8 pb-12">
        {/* Project Title */}
        <div className="flex items-center gap-2">
          {isEditingName ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Input
                ref={nameInputRef}
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={handleNameKeyDown}
                onBlur={handleSaveName}
                className="text-2xl font-semibold h-10"
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
              className="text-2xl font-semibold cursor-pointer hover:text-primary transition-colors truncate"
              onClick={handleStartEditName}
              title="Click to edit"
            >
              {project.name}
            </h1>
          )}
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowDeleteConfirm(true)}
            className="text-destructive hover:text-destructive/80"
          >
            <HugeiconsIcon icon={Delete02Icon} size={20} strokeWidth={2.5} data-slot="icon" />
          </Button>
        </div>

        {/* Repositories + Sidebar (Tags & Notes) */}
          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            {/* Repositories Section - Left side */}
            <section className="flex-1 space-y-4 min-w-0">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Repositories ({project.repositories.length})
                </h2>
                <div className="flex items-center gap-2">
                  {project.repositories.length > 0 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAddRepoModalOpen(true)}
                        className="h-7 text-xs"
                      >
                        <HugeiconsIcon icon={FolderAddIcon} size={14} data-slot="icon" />
                        {t('addRepo')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setBulkAddModalOpen(true)}
                        className="h-7 text-xs"
                      >
                        <HugeiconsIcon icon={CopyLinkIcon} size={14} data-slot="icon" />
                        {t('linkRepo')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {project.repositories.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <p className="text-sm">No repositories linked to this project.</p>
                    <div className="mt-4 flex justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAddRepoModalOpen(true)}
                      >
                        <HugeiconsIcon icon={FolderAddIcon} size={14} data-slot="icon" />
                        {t('addRepo')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setBulkAddModalOpen(true)}
                      >
                        <HugeiconsIcon icon={CopyLinkIcon} size={14} data-slot="icon" />
                        {t('linkRepo')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {project.repositories.map((repo) => (
                    <RepositoryCard
                      key={repo.id}
                      repository={repo}
                      onRemove={() => setRemoveRepoDialog({ open: true, repository: repo })}
                      onNewTask={() => setTaskModalRepo(repo)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Sidebar - Right side (Description, Tags & Notes) */}
            <aside className="w-full lg:w-72 shrink-0 space-y-4">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Details
              </h2>

              {/* Description */}
              <ProjectDescriptionEditor projectId={projectId} description={project.description} />

              {/* Tags */}
              <ProjectTagsManager projectId={projectId} tags={project.tags || []} />

              {/* Links */}
              <ProjectLinksManager projectId={projectId} links={project.links || []} />

              {/* Notes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</h3>
                  {!isEditingNotes && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={handleStartEditNotes}
                    >
                      <HugeiconsIcon icon={Edit02Icon} size={12} data-slot="icon" />
                      Edit
                    </Button>
                  )}
                </div>
                {isEditingNotes ? (
                  <div className="space-y-2">
                    <Textarea
                      ref={notesTextareaRef}
                      value={editedNotes}
                      onChange={(e) => setEditedNotes(e.target.value)}
                      placeholder="Add notes about this project..."
                      className="min-h-[100px] text-sm"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveNotes}>
                        <HugeiconsIcon icon={Tick02Icon} size={12} data-slot="icon" />
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" onClick={handleCancelEditNotes}>
                        <HugeiconsIcon icon={Cancel01Icon} size={12} data-slot="icon" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : project.notes ? (
                  <div className="max-h-12 overflow-y-auto text-sm whitespace-pre-wrap text-muted-foreground">
                    {project.notes}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No notes</p>
                )}
              </div>
            </aside>
          </div>

          {/* Tasks Section */}
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Tasks ({filteredTasks.length})
            </h2>

            {/* Status filter */}
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">Filter:</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  checked={statusFilter.has('TO_DO')}
                  onCheckedChange={() => toggleStatus('TO_DO')}
                />
                <span>To Do</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  checked={statusFilter.has('IN_PROGRESS')}
                  onCheckedChange={() => toggleStatus('IN_PROGRESS')}
                />
                <span>In Progress</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  checked={statusFilter.has('IN_REVIEW')}
                  onCheckedChange={() => toggleStatus('IN_REVIEW')}
                />
                <span>In Review</span>
              </label>
            </div>

            {/* Scrollable task list */}
            {filteredTasks.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground">
                  <p className="text-sm">
                    {activeTasks.length === 0
                      ? 'No active tasks.'
                      : 'No tasks match the selected filters.'}
                  </p>
                  {activeTasks.length === 0 && project.repositories.length > 0 && (
                    <Button
                      variant="link"
                      size="sm"
                      className="mt-2"
                      onClick={() => setTaskModalRepo(project.repositories[0])}
                    >
                      Create a task
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="max-h-[300px] overflow-y-auto">
                  {filteredTasks.map((task) => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </div>
              </Card>
            )}
          </section>

          {/* Archived Tasks (Completed & Cancelled) - Collapsible */}
          {archivedTasks.length > 0 && (
            <Collapsible open={archiveOpen} onOpenChange={setArchiveOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
                <HugeiconsIcon
                  icon={archiveOpen ? ArrowDown01Icon : ArrowRight01Icon}
                  size={14}
                  className="text-muted-foreground"
                />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
                  Completed & Cancelled ({archivedTasks.length})
                </h2>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                <Card className="overflow-hidden">
                  <div className="max-h-[250px] overflow-y-auto">
                    {archivedTasks.map((task) => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </div>
                </Card>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Attachments Section */}
          <section className="space-y-4">
            <ProjectAttachmentsManager projectId={projectId} />
          </section>
        </div>
      </ScrollArea>

      {/* Task creation modal */}
      {taskModalRepo && (
        <CreateTaskModal
          open={taskModalRepo !== null}
          onOpenChange={(open) => !open && setTaskModalRepo(null)}
          defaultRepository={taskModalRepo}
          showTrigger={false}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={(open) => !isDeleting && setShowDeleteConfirm(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete.confirmText', { name: project.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('delete.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" data-slot="icon" />
                  {t('delete.deleting')}
                </>
              ) : (
                t('delete.confirm')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Repository Modal (with project pre-selected) */}
      <AddRepositoryModal
        open={addRepoModalOpen}
        onOpenChange={setAddRepoModalOpen}
        projectId={projectId}
      />

      {/* Bulk Add Repositories Modal */}
      <LinkRepositoriesModal
        open={linkRepoModalOpen}
        onOpenChange={setBulkAddModalOpen}
        projectId={projectId}
        projectName={project.name}
      />

      {/* Remove Repository Dialog */}
      <RemoveRepositoryDialog
        open={removeRepoDialog.open}
        onOpenChange={(open) => setRemoveRepoDialog({ open, repository: open ? removeRepoDialog.repository : null })}
        projectId={projectId}
        repository={removeRepoDialog.repository}
      />
    </>
  )
}
