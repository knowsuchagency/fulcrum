import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createFileRoute, Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useProject, useDeleteProject, useAccessProject, useUpdateProject } from '@/hooks/use-projects'
import { useTasks } from '@/hooks/use-tasks'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
  FolderAddIcon,
  Tick02Icon,
  Settings05Icon,
  WindowsOldIcon,
  Rocket01Icon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  Edit02Icon,
  CopyLinkIcon,
  TaskAdd01Icon,
  Add01Icon,
  Link01Icon,
  File02Icon,
  Image02Icon,
  Pdf01Icon,
  Upload02Icon,
} from '@hugeicons/core-free-icons'
import type { ProjectRepositoryDetails, Task, TaskStatus, Tag, ProjectLink } from '@/types'
import { toast } from 'sonner'
import { CreateTaskModal } from '@/components/kanban/create-task-modal'
import { cn } from '@/lib/utils'
import { LinkRepositoriesModal } from '@/components/projects/link-repositories-modal'
import { AddRepositoryModal } from '@/components/projects/add-repository-modal'
import { RemoveRepositoryDialog } from '@/components/projects/remove-repository-dialog'
import { useSearchTags, useAddProjectTag, useRemoveProjectTag } from '@/hooks/use-tags'
import { useAddProjectLink, useRemoveProjectLink } from '@/hooks/use-projects'
import {
  useProjectAttachments,
  useUploadProjectAttachment,
  useDeleteProjectAttachment,
  getProjectAttachmentDownloadUrl,
} from '@/hooks/use-project-attachments'
import { openExternalUrl } from '@/lib/editor-url'
import { ProjectAgentSettings } from '@/components/project/project-agent-settings'

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectDetailView,
})

// Status colors for sparkline dots
const SPARKLINE_COLORS: Record<TaskStatus, string> = {
  TO_DO: 'bg-muted-foreground/40',
  IN_PROGRESS: 'bg-blue-500',
  IN_REVIEW: 'bg-amber-500',
  DONE: 'bg-green-500/40',
  CANCELED: 'bg-muted-foreground/20',
}

// Task sparkline component - shows 8 dots representing recent task status distribution
function TaskSparkline({ tasks }: { tasks: Task[] }) {
  const { t } = useTranslation('projects')

  // Get up to 8 most recent active tasks for the sparkline
  const activeTasks = tasks
    .filter((t) => t.status !== 'DONE' && t.status !== 'CANCELED')
    .slice(0, 8)

  const activeCount = tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELED').length
  const doneCount = tasks.filter((t) => t.status === 'DONE' || t.status === 'CANCELED').length

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-0.5">
        {activeTasks.length > 0 ? (
          activeTasks.map((task) => (
            <div
              key={task.id}
              className={cn('w-1.5 h-1.5 rounded-full', SPARKLINE_COLORS[task.status])}
              title={`${task.title} (${task.status})`}
            />
          ))
        ) : (
          // Show empty placeholder dots when no active tasks
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-muted" />
          ))
        )}
      </div>
      <span>
        {t('repoCard.activeCount', { count: activeCount })}
        {doneCount > 0 && ` · ${t('repoCard.doneCount', { count: doneCount })}`}
      </span>
    </div>
  )
}

function RepositoryCard({
  repository,
  tasks,
  onRemove,
  onNewTask,
}: {
  repository: ProjectRepositoryDetails
  tasks: Task[]
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
      <CardContent className="py-3 px-4">
        {/* Header row: name and remove button */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium truncate group-hover:text-primary transition-colors">
              {repository.displayName}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
              <span className="truncate font-mono">{repository.path}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
          </Button>
        </div>

        {/* Task sparkline */}
        <div className="mt-2">
          <TaskSparkline tasks={tasks} />
        </div>

        {/* Compact action buttons */}
        <div className="mt-3 flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              onClick={(e) => {
                e.stopPropagation()
                onNewTask()
              }}
              className="inline-flex items-center justify-center gap-1 whitespace-nowrap text-sm font-medium h-7 px-2 rounded-md border bg-background hover:bg-accent hover:text-accent-foreground text-muted-foreground"
            >
              <HugeiconsIcon icon={TaskAdd01Icon} size={14} strokeWidth={2} />
              <span>Task</span>
            </TooltipTrigger>
            <TooltipContent>New Task</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              onClick={(e) => {
                e.stopPropagation()
                navigate({
                  to: '/repositories/$repoId',
                  params: { repoId: repository.id },
                  search: { tab: 'workspace' },
                })
              }}
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium h-7 px-2 rounded-md border bg-background hover:bg-accent hover:text-accent-foreground text-muted-foreground"
            >
              <HugeiconsIcon icon={WindowsOldIcon} size={14} strokeWidth={2} />
            </TooltipTrigger>
            <TooltipContent>Open Workspace</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              onClick={(e) => {
                e.stopPropagation()
                navigate({
                  to: '/repositories/$repoId',
                  params: { repoId: repository.id },
                  search: { tab: 'deploy', action: 'deploy' },
                })
              }}
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium h-7 px-2 rounded-md border bg-background hover:bg-accent hover:text-accent-foreground text-muted-foreground"
            >
              <HugeiconsIcon icon={Rocket01Icon} size={14} strokeWidth={2} />
            </TooltipTrigger>
            <TooltipContent>Deploy</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              onClick={(e) => {
                e.stopPropagation()
                navigate({
                  to: '/repositories/$repoId',
                  params: { repoId: repository.id },
                  search: { tab: 'settings' },
                })
              }}
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium h-7 px-2 rounded-md border bg-background hover:bg-accent hover:text-accent-foreground text-muted-foreground"
            >
              <HugeiconsIcon icon={Settings05Icon} size={14} strokeWidth={2} />
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
        </div>
      </CardContent>
    </Card>
  )
}

// Inline tags component for compact header
function InlineTags({
  projectId,
  tags,
}: {
  projectId: string
  tags: Tag[]
}) {
  const { t } = useTranslation('projects')
  const [isAdding, setIsAdding] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: searchResults = [] } = useSearchTags(searchQuery)
  const addTagMutation = useAddProjectTag()
  const removeTagMutation = useRemoveProjectTag()

  const availableTags = searchResults.filter(
    (result) => !tags.some((t) => t.id === result.id)
  )
  const exactMatch = searchResults.find(
    (t) => t.name.toLowerCase() === searchQuery.toLowerCase()
  )
  const showCreateOption = searchQuery.trim() && !exactMatch

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
        setIsAdding(false)
        setSearchQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleAddTag = async (tagOrName: { id: string; name: string } | string) => {
    try {
      if (typeof tagOrName === 'string') {
        await addTagMutation.mutateAsync({ projectId, name: tagOrName })
      } else {
        await addTagMutation.mutateAsync({ projectId, tagId: tagOrName.id })
      }
      setSearchQuery('')
      setShowDropdown(false)
      setIsAdding(false)
    } catch {
      // Error handled by mutation
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      e.preventDefault()
      if (exactMatch && !tags.some((t) => t.id === exactMatch.id)) {
        handleAddTag(exactMatch)
      } else if (showCreateOption) {
        handleAddTag(searchQuery.trim())
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
      setIsAdding(false)
      setSearchQuery('')
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap" ref={containerRef}>
      {tags.map((tag) => (
        <Badge key={tag.id} variant="default" className="text-xs group/tag">
          {tag.name}
          <button
            onClick={() => removeTagMutation.mutate({ projectId, tagId: tag.id })}
            className="ml-1 opacity-0 group-hover/tag:opacity-100 hover:text-destructive transition-opacity"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={10} />
          </button>
        </Badge>
      ))}
      {isAdding ? (
        <div className="relative">
          <Input
            ref={inputRef}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setShowDropdown(true)
            }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={handleKeyDown}
            placeholder={t('detail.addTag')}
            className="h-6 w-24 text-xs"
            autoFocus
          />
          {showDropdown && (searchQuery || availableTags.length > 0) && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-popover border rounded-md shadow-lg z-50 max-h-32 overflow-y-auto">
              {availableTags.slice(0, 5).map((tag) => (
                <button
                  key={tag.id}
                  className="w-full px-2 py-1.5 text-left text-xs hover:bg-accent"
                  onClick={() => handleAddTag(tag)}
                >
                  {tag.name}
                </button>
              ))}
              {showCreateOption && (
                <button
                  className="w-full px-2 py-1.5 text-left text-xs hover:bg-accent flex items-center gap-1 border-t"
                  onClick={() => handleAddTag(searchQuery.trim())}
                >
                  <HugeiconsIcon icon={Add01Icon} size={12} />
                  {t('detail.createTag', { tag: searchQuery.trim() })}
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => {
            setIsAdding(true)
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
          className="h-5 w-5 rounded border border-dashed border-muted-foreground/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
        >
          <HugeiconsIcon icon={Add01Icon} size={12} />
        </button>
      )}
    </div>
  )
}

// Inline links component
function InlineLinks({
  projectId,
  links,
}: {
  projectId: string
  links: ProjectLink[]
}) {
  const { t } = useTranslation('projects')
  const [isAdding, setIsAdding] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const addLink = useAddProjectLink()
  const removeLink = useRemoveProjectLink()

  const handleAddLink = () => {
    const trimmedUrl = newUrl.trim()
    if (!trimmedUrl) return

    try {
      new URL(trimmedUrl)
    } catch {
      toast.error(t('detail.errors.invalidUrl', { defaultValue: 'Invalid URL' }), {
        description: t('detail.errors.invalidUrlDescription', { defaultValue: 'Please enter a valid URL including the scheme (e.g., https://)' }),
      })
      return
    }

    addLink.mutate(
      { projectId, url: trimmedUrl, label: newLabel.trim() || undefined },
      {
        onSuccess: () => {
          setNewUrl('')
          setNewLabel('')
          setIsAdding(false)
        },
      }
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddLink()
    } else if (e.key === 'Escape') {
      setIsAdding(false)
      setNewUrl('')
      setNewLabel('')
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('detail.sections.links')}</h3>
      <div className="flex items-center gap-2 flex-wrap">
        {links.map((link) => (
          <div key={link.id} className="group/link flex items-center">
            <button
              onClick={() => openExternalUrl(link.url)}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <HugeiconsIcon icon={Link01Icon} size={12} />
              <span className="max-w-32 truncate">{link.label || link.url}</span>
            </button>
            <button
              onClick={() => removeLink.mutate({ projectId, linkId: link.id })}
              className="ml-1 opacity-0 group-hover/link:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={10} />
            </button>
          </div>
        ))}
        {isAdding ? (
          <div className="flex items-center gap-1">
            <Input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('detail.urlPlaceholder')}
              className="h-6 w-32 text-xs"
              autoFocus
            />
            <Input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('detail.labelPlaceholder')}
              className="h-6 w-20 text-xs"
            />
            <Button size="sm" className="h-6 px-2 text-xs" onClick={handleAddLink}>
              {t('detail.add')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1"
              onClick={() => {
                setIsAdding(false)
                setNewUrl('')
                setNewLabel('')
              }}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <HugeiconsIcon icon={Add01Icon} size={12} />
            <span>{t('detail.add')}</span>
          </button>
        )}
      </div>
    </div>
  )
}

// Inline attachments component
function InlineAttachments({ projectId }: { projectId: string }) {
  const { t } = useTranslation('projects')
  const { data: attachments = [], isLoading } = useProjectAttachments(projectId)
  const uploadMutation = useUploadProjectAttachment()
  const deleteMutation = useDeleteProjectAttachment()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      for (const file of Array.from(files)) {
        try {
          await uploadMutation.mutateAsync({ projectId, file })
        } catch {
          // Error handled by mutation
        }
      }
    },
    [projectId, uploadMutation]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      handleFileSelect(e.dataTransfer.files)
    },
    [handleFileSelect]
  )

  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/pdf') return Pdf01Icon
    if (mimeType.startsWith('image/')) return Image02Icon
    return File02Icon
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('detail.sections.attachments')}</h3>
        <span className="text-xs text-muted-foreground">{t('detail.loading')}</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('detail.sections.attachments')}</h3>
      <div className="flex items-center gap-2 flex-wrap">
        {attachments.map((attachment) => {
          const FileIcon = getFileIcon(attachment.mimeType)
          return (
            <div key={attachment.id} className="group/file flex items-center gap-1 text-xs">
              <button
                onClick={() => window.open(getProjectAttachmentDownloadUrl(projectId, attachment.id), '_blank')}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={FileIcon} size={12} />
                <span className="max-w-24 truncate">{attachment.filename}</span>
                <span className="text-muted-foreground/70">({formatFileSize(attachment.size)})</span>
              </button>
              <button
                onClick={() => deleteMutation.mutate({ projectId, attachmentId: attachment.id })}
                className="opacity-0 group-hover/file:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={10} />
              </button>
            </div>
          )
        })}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.svg,.txt,.md,.doc,.docx,.xls,.xlsx,.json,.zip,.gz,.tar"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 border border-dashed rounded',
            isDragging && 'border-primary bg-primary/5',
            uploadMutation.isPending && 'opacity-50'
          )}
        >
          <HugeiconsIcon icon={uploadMutation.isPending ? Loading03Icon : Upload02Icon} size={12} className={uploadMutation.isPending ? 'animate-spin' : ''} />
          <span>{uploadMutation.isPending ? t('detail.uploading') : t('detail.dropOrClickShort')}</span>
        </button>
      </div>
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

  // Description editing state
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [editedDescription, setEditedDescription] = useState('')

  // Notes section collapsed state
  const [notesOpen, setNotesOpen] = useState(false)
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [editedNotes, setEditedNotes] = useState('')
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null)

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

  // Compute tasks for each repository
  const tasksByRepo = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const repo of project?.repositories ?? []) {
      const repoTasks = allTasks.filter(
        (task) => task.repoPath === repo.path || (task.projectId === projectId && !task.repoPath)
      )
      map.set(repo.id, repoTasks)
    }
    return map
  }, [allTasks, project?.repositories, projectId])

  // Compute all active tasks for this project (non-DONE, non-CANCELED)
  const activeTasks = useMemo(() => {
    return allTasks.filter(
      (task) =>
        task.status !== 'DONE' &&
        task.status !== 'CANCELED' &&
        (task.projectId === projectId ||
          project?.repositories.some((r) => r.path === task.repoPath))
    )
  }, [allTasks, projectId, project?.repositories])

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

  const handleStartEditDescription = useCallback(() => {
    if (project) {
      setEditedDescription(project.description || '')
      setIsEditingDescription(true)
    }
  }, [project])

  const handleSaveDescription = useCallback(() => {
    const newDesc = editedDescription.trim() || null
    if (newDesc !== (project?.description || null)) {
      updateProject.mutate({ id: projectId, updates: { description: newDesc } })
    }
    setIsEditingDescription(false)
  }, [editedDescription, project?.description, projectId, updateProject])

  const handleStartEditNotes = useCallback(() => {
    if (project) {
      setEditedNotes(project.notes || '')
      setIsEditingNotes(true)
      setNotesOpen(true)
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
      <div className="flex h-full flex-col">
        {/* Header bar - matches repo detail view pattern */}
        <div className="film-grain relative flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-2" style={{ background: 'var(--gradient-header)' }}>
          {/* Left: Project name */}
          {isEditingName ? (
            <Input
              ref={nameInputRef}
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={handleNameKeyDown}
              className="font-medium text-sm bg-transparent border-b border-primary outline-none px-0.5 w-auto max-w-[200px] h-auto py-0"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={handleStartEditName}
              className="font-medium text-sm hover:text-primary transition-colors cursor-pointer"
              title={t('detail.clickToEdit')}
            >
              {project.name}
            </button>
          )}

          {/* Middle: Actions */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => project.repositories.length > 0 && setTaskModalRepo(project.repositories[0])}
              disabled={project.repositories.length === 0}
              className="text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={TaskAdd01Icon} size={14} strokeWidth={2} data-slot="icon" />
              <span className="hidden sm:inline">{t('detail.actions.task')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAddRepoModalOpen(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={FolderAddIcon} size={14} strokeWidth={2} data-slot="icon" />
              <span className="hidden sm:inline">{t('detail.actions.repo')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBulkAddModalOpen(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={CopyLinkIcon} size={14} strokeWidth={2} data-slot="icon" />
              <span className="hidden sm:inline">{t('detail.actions.link')}</span>
            </Button>
          </div>

          {/* Right: Delete */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
            </Button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-5xl space-y-6 pb-6">
            {/* Description (below header) */}
            {isEditingDescription ? (
              <div className="flex items-start gap-2">
                <Textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  placeholder={t('detail.addDescription')}
                  className="min-h-[60px] text-sm flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.metaKey) {
                      handleSaveDescription()
                    } else if (e.key === 'Escape') {
                      setIsEditingDescription(false)
                    }
                  }}
                />
                <div className="flex flex-col gap-1">
                  <Button size="sm" className="h-7" onClick={handleSaveDescription}>
                    {t('detail.save')}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => setIsEditingDescription(false)}>
                    {t('detail.cancel')}
                  </Button>
                </div>
              </div>
            ) : project.description ? (
              <p
                className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                onClick={handleStartEditDescription}
                title={t('detail.clickToEdit')}
              >
                {project.description}
              </p>
            ) : null}

            {/* Repositories Section */}
            <section className="rounded-lg border p-4 space-y-3 bg-card">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('detail.sections.repositories')}
              </h2>

            {project.repositories.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-6 text-center text-muted-foreground">
                  <p className="text-sm">{t('detail.noRepositories')}</p>
                  <div className="mt-3 flex justify-center gap-2">
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
                      {t('detail.linkExisting')}
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
                    tasks={tasksByRepo.get(repo.id) || []}
                    onRemove={() => setRemoveRepoDialog({ open: true, repository: repo })}
                    onNewTask={() => setTaskModalRepo(repo)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Links and Attachments - Two column grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="film-grain relative rounded-lg border p-4" style={{ background: 'var(--gradient-card)' }}>
              <InlineLinks projectId={projectId} links={project.links || []} />
            </div>
            <div className="film-grain relative rounded-lg border p-4" style={{ background: 'var(--gradient-card)' }}>
              <InlineAttachments projectId={projectId} />
            </div>
          </div>

          {/* Tags and Notes - Two column grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Tags */}
            <div className="film-grain relative rounded-lg border p-4 space-y-2" style={{ background: 'var(--gradient-card)' }}>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('detail.sections.tags')}</h3>
              <InlineTags projectId={projectId} tags={project.tags || []} />
            </div>

            {/* Notes - Collapsible */}
            <Collapsible open={notesOpen} onOpenChange={setNotesOpen} className="film-grain relative rounded-lg border p-4" style={{ background: 'var(--gradient-card)' }}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
                <HugeiconsIcon
                  icon={notesOpen ? ArrowDown01Icon : ArrowRight01Icon}
                  size={14}
                  className="text-muted-foreground"
                />
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
                  {t('detail.sections.notes')}
                </h2>
                {!notesOpen && project.notes && (
                  <span className="text-xs text-muted-foreground truncate max-w-xs">
                    — {project.notes.split('\n')[0]}
                  </span>
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                {isEditingNotes ? (
                  <div className="space-y-2">
                    <Textarea
                      ref={notesTextareaRef}
                      value={editedNotes}
                      onChange={(e) => setEditedNotes(e.target.value)}
                      placeholder={t('detail.addNotes')}
                      className="min-h-[100px] text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.metaKey) {
                          handleSaveNotes()
                        } else if (e.key === 'Escape') {
                          handleCancelEditNotes()
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveNotes}>
                        <HugeiconsIcon icon={Tick02Icon} size={12} data-slot="icon" />
                        {t('detail.save')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={handleCancelEditNotes}>
                        {t('detail.cancel')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    {project.notes ? (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap flex-1">
                        {project.notes}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">{t('detail.noNotes')}</p>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-7 text-xs"
                      onClick={handleStartEditNotes}
                    >
                      <HugeiconsIcon icon={Edit02Icon} size={12} data-slot="icon" />
                      {t('detail.edit')}
                    </Button>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Agent Settings - Collapsible */}
          <ProjectAgentSettings project={project} />

          {/* Active Tasks Section */}
          <section className="film-grain relative rounded-lg border p-4 space-y-3" style={{ background: 'var(--gradient-card)' }}>
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t('detail.sections.activeTasks')}
            </h2>
            {activeTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('detail.noActiveTasks')}</p>
            ) : (
              <div className="space-y-2">
                {activeTasks.map((task) => (
                  <Link
                    key={task.id}
                    to="/tasks/$taskId"
                    params={{ taskId: task.id }}
                    className="flex items-center gap-2 p-2 rounded-md border bg-background hover:bg-accent transition-colors"
                  >
                    <Badge
                      variant={
                        task.status === 'IN_PROGRESS'
                          ? 'default'
                          : task.status === 'IN_REVIEW'
                            ? 'secondary'
                            : 'outline'
                      }
                      className="text-xs shrink-0"
                    >
                      {task.status.replace('_', ' ')}
                    </Badge>
                    <span className="text-sm truncate">{task.title}</span>
                    {task.repoPath && (
                      <span className="text-xs text-muted-foreground ml-auto truncate max-w-32">
                        {task.repoPath.split('/').pop()}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>
          </div>
        </div>
      </div>

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
