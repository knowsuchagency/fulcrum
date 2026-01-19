import { useState, useMemo, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  useCopierTemplates,
  useCopierQuestions,
} from '@/hooks/use-copier'
import {
  useAddRepositoryToProject,
  useScanProjects,
  useBulkCreateProjects,
  useProjects,
  useCreateProject,
  type ScannedProject,
  type RepositoryConflict,
} from '@/hooks/use-projects'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FilesystemBrowser } from '@/components/ui/filesystem-browser'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@/components/ui/combobox'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  Alert02Icon,
  CheckmarkCircle02Icon,
  Search01Icon,
  Folder01Icon,
  Link01Icon,
  EyeIcon,
  ViewOffIcon,
  Add01Icon,
} from '@hugeicons/core-free-icons'
import { useDefaultGitReposDir } from '@/hooks/use-config'
import type { CopierQuestion } from '@/types'
import { fetchJSON } from '@/lib/api'

interface AddRepositoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** If provided, skips project selection. If not, shows project selector. */
  projectId?: string
  initialTab?: 'clone' | 'local' | 'scan' | 'template'
}

/**
 * Check if a string looks like a git URL
 */
function isGitUrl(source: string): boolean {
  return (
    source.startsWith('git@') ||
    source.startsWith('https://') ||
    source.startsWith('http://') ||
    source.startsWith('gh:') ||
    source.startsWith('gl:') ||
    source.startsWith('bb:')
  )
}

/**
 * Extract repository name from a git URL
 */
function extractRepoNameFromUrl(url: string): string {
  const cleaned = url.replace(/\.git$/, '')

  if (cleaned.startsWith('git@')) {
    const match = cleaned.match(/:([^/]+\/)?([^/]+)$/)
    if (match) return match[2]
  } else if (
    cleaned.startsWith('gh:') ||
    cleaned.startsWith('gl:') ||
    cleaned.startsWith('bb:')
  ) {
    const parts = cleaned.split('/')
    if (parts.length > 0) return parts[parts.length - 1]
  } else {
    const parts = cleaned.split('/')
    if (parts.length > 0) return parts[parts.length - 1]
  }

  return cleaned
}

export function AddRepositoryModal({
  open,
  onOpenChange,
  projectId: propProjectId,
  initialTab = 'clone',
}: AddRepositoryModalProps) {
  const { t } = useTranslation('repositories')
  const queryClient = useQueryClient()
  const { data: defaultGitReposDir } = useDefaultGitReposDir()
  const { data: projects } = useProjects()
  const addRepositoryMutation = useAddRepositoryToProject()
  const scanMutation = useScanProjects()
  const bulkCreateMutation = useBulkCreateProjects()
  const createProjectMutation = useCreateProject()

  // Project selection state (only used when propProjectId is not provided)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [projectSearchQuery, setProjectSearchQuery] = useState('')
  const [projectError, setProjectError] = useState<string | null>(null)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')

  // Effective project ID - either from prop or selected
  const projectId = propProjectId ?? selectedProjectId

  // Main tab state
  const [activeTab, setActiveTab] = useState<string>(initialTab)

  // Clone tab state
  const [cloneUrl, setCloneUrl] = useState('')
  const [targetDir, setTargetDir] = useState('')
  const [folderName, setFolderName] = useState('')
  const [cloneError, setCloneError] = useState<string | null>(null)
  const [targetDirBrowserOpen, setTargetDirBrowserOpen] = useState(false)

  // Local tab state
  const [localPath, setLocalPath] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [localBrowserOpen, setLocalBrowserOpen] = useState(false)

  // Scan tab state
  const [scanDirectory, setScanDirectory] = useState('')
  const [scannedRepos, setScannedRepos] = useState<ScannedProject[] | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanBrowserOpen, setScanBrowserOpen] = useState(false)

  // Template tab state
  const [templateSource, setTemplateSource] = useState('')
  const [customTemplateUrl, setCustomTemplateUrl] = useState('')
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [outputPath, setOutputPath] = useState('')
  const [templateProjectName, setTemplateProjectName] = useState('')
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [trust, setTrust] = useState(true)
  const [outputBrowserOpen, setOutputBrowserOpen] = useState(false)
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set())

  // Conflict dialog state
  const [conflictDialog, setConflictDialog] = useState<{
    open: boolean
    conflict: RepositoryConflict | null
    pendingAction: (() => void) | null
  }>({ open: false, conflict: null, pendingAction: null })

  // Template tab queries
  const { data: templates } = useCopierTemplates()
  const effectiveTemplateSource = templateSource || customTemplateUrl
  const {
    data: questionsData,
    isLoading: questionsLoading,
    error: questionsError,
  } = useCopierQuestions(activeTab === 'template' && effectiveTemplateSource ? effectiveTemplateSource : null)

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab)
      setSelectedProjectId(null)
      setProjectSearchQuery('')
      setProjectError(null)
      setIsCreatingProject(false)
      setNewProjectName('')
      setCloneUrl('')
      setTargetDir('')
      setFolderName('')
      setCloneError(null)
      setLocalPath('')
      setLocalError(null)
      setScanDirectory('')
      setScannedRepos(null)
      setSelectedPaths(new Set())
      setScanError(null)
      setTemplateSource('')
      setCustomTemplateUrl('')
      setAnswers({})
      setOutputPath(defaultGitReposDir || '')
      setTemplateProjectName('')
      setTemplateError(null)
      setTrust(true)
      setVisiblePasswords(new Set())
    }
  }, [open, initialTab, defaultGitReposDir])

  // Computed values for clone tab
  const extractedRepoName = useMemo(
    () => (cloneUrl.trim() ? extractRepoNameFromUrl(cloneUrl.trim()) : null),
    [cloneUrl]
  )

  // Update folderName when URL changes
  useEffect(() => {
    if (extractedRepoName && !folderName) {
      setFolderName(extractedRepoName)
    }
  }, [extractedRepoName, folderName])

  const effectiveTargetDir = targetDir.trim() || defaultGitReposDir || ''
  const effectiveScanDirectory = scanDirectory.trim() || defaultGitReposDir || ''

  const clonePath = useMemo(() => {
    if (!cloneUrl.trim() || !effectiveTargetDir) return null
    const name = folderName.trim() || extractedRepoName || ''
    if (!name) return null
    return `${effectiveTargetDir}/${name}`
  }, [cloneUrl, effectiveTargetDir, folderName, extractedRepoName])

  // Scan tab computed values - repos that don't have projects yet can be added
  const addableRepos = useMemo(
    () => scannedRepos?.filter((r) => !r.hasProject) ?? [],
    [scannedRepos]
  )

  const isClonePending = addRepositoryMutation.isPending && activeTab === 'clone'
  const isLocalPending = addRepositoryMutation.isPending && activeTab === 'local'
  const isScanPending = scanMutation.isPending || bulkCreateMutation.isPending
  const isTemplatePending = addRepositoryMutation.isPending && activeTab === 'template'

  // Filtered projects for project selector
  const filteredProjects = useMemo(() => {
    if (!projects) return []
    if (!projectSearchQuery.trim()) return projects
    const query = projectSearchQuery.toLowerCase()
    return projects.filter((p) =>
      p.name.toLowerCase().includes(query)
    )
  }, [projects, projectSearchQuery])

  // Selected project name for display
  const selectedProject = projects?.find((p) => p.id === selectedProjectId)

  // Handle creating a new project inline
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return
    setProjectError(null)

    try {
      const newProject = await createProjectMutation.mutateAsync({
        name: newProjectName.trim(),
      })
      setSelectedProjectId(newProject.id)
      setIsCreatingProject(false)
      setNewProjectName('')
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Failed to create project')
    }
  }

  // Initialize template answers with defaults when questions load
  useEffect(() => {
    if (questionsData?.questions) {
      setAnswers((prev) => {
        const merged = { ...prev }
        for (const q of questionsData.questions) {
          if (merged[q.name] === undefined && q.default !== undefined) {
            merged[q.name] = q.default
          }
        }
        return merged
      })
    }
  }, [questionsData])

  // Initialize outputPath with default when dialog opens
  useEffect(() => {
    if (defaultGitReposDir && !outputPath) {
      setOutputPath(defaultGitReposDir)
    }
  }, [defaultGitReposDir, outputPath])

  // Template validation
  const missingRequiredQuestions = questionsData?.questions.filter((q) => {
    const hasDefault = q.default !== undefined &&
      !(typeof q.default === 'string' && q.default.includes('{{'))
    if (hasDefault) return false
    const answer = answers[q.name]
    if (answer === undefined || answer === null || answer === '') return true
    return false
  }) ?? []

  const canCreateFromTemplate = effectiveTemplateSource && templateProjectName.trim() && outputPath.trim() &&
    !questionsLoading && missingRequiredQuestions.length === 0

  // Handle clone
  const handleClone = async (moveFromProject = false) => {
    if (!projectId) {
      setProjectError('Please select a project first')
      return
    }
    setCloneError(null)
    setProjectError(null)
    const url = cloneUrl.trim()
    if (!url || !isGitUrl(url)) return

    try {
      await addRepositoryMutation.mutateAsync({
        projectId,
        url,
        targetDir: targetDir.trim() || undefined,
        folderName: folderName.trim() || undefined,
        moveFromProject,
      })
      onOpenChange(false)
    } catch (err) {
      const error = err as Error & { conflict?: RepositoryConflict }
      if (error.conflict?.conflictProject) {
        setConflictDialog({
          open: true,
          conflict: error.conflict,
          pendingAction: () => handleClone(true),
        })
      } else {
        setCloneError(error.message || t('addModal.cloneFailed'))
      }
    }
  }

  // Handle add local
  const handleAddLocal = async (moveFromProject = false) => {
    if (!projectId) {
      setProjectError('Please select a project first')
      return
    }
    setLocalError(null)
    setProjectError(null)
    const path = localPath.trim()
    if (!path) return

    try {
      await addRepositoryMutation.mutateAsync({
        projectId,
        path,
        moveFromProject,
      })
      onOpenChange(false)
    } catch (err) {
      const error = err as Error & { conflict?: RepositoryConflict }
      if (error.conflict?.conflictProject) {
        setConflictDialog({
          open: true,
          conflict: error.conflict,
          pendingAction: () => handleAddLocal(true),
        })
      } else {
        setLocalError(error.message || t('addModal.createFailed'))
      }
    }
  }

  // Scan handlers
  const handleScan = () => {
    setScanError(null)
    setScannedRepos(null)
    setSelectedPaths(new Set())

    scanMutation.mutate(effectiveScanDirectory || undefined, {
      onSuccess: (result) => {
        setScannedRepos(result.repositories)
        // Pre-select all repos that don't have projects yet
        const addable = result.repositories.filter((r) => !r.hasProject)
        setSelectedPaths(new Set(addable.map((r) => r.path)))
      },
      onError: (err) => {
        setScanError(err instanceof Error ? err.message : t('bulkAdd.scanFailed'))
      },
    })
  }

  const handleToggle = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedPaths(new Set(addableRepos.map((r) => r.path)))
  }

  const handleSelectNone = () => {
    setSelectedPaths(new Set())
  }

  const handleBulkAdd = async () => {
    if (!projectId) {
      setProjectError('Please select a project first')
      return
    }
    if (selectedPaths.size === 0) return
    setScanError(null)
    setProjectError(null)

    // Add each repository to the project
    let added = 0
    let failed = 0

    for (const path of selectedPaths) {
      try {
        await addRepositoryMutation.mutateAsync({
          projectId,
          path,
        })
        added++
      } catch {
        failed++
      }
    }

    if (failed > 0) {
      setScanError(`Added ${added} repositories, ${failed} failed`)
    } else {
      onOpenChange(false)
    }
  }

  // Template handler
  const shouldTrust = !!templateSource || trust

  const handleCreateFromTemplate = async () => {
    if (!projectId) {
      setProjectError('Please select a project first')
      return
    }
    setTemplateError(null)
    setProjectError(null)
    try {
      // Create the repository from template and link to the selected project
      await fetchJSON<{ projectId: string; repositoryId: string; path: string }>(
        '/api/copier/create',
        {
          method: 'POST',
          body: JSON.stringify({
            templateSource: effectiveTemplateSource,
            outputPath,
            answers,
            projectName: templateProjectName,
            trust: shouldTrust,
            existingProjectId: projectId, // Link repo to selected project
          }),
        }
      )

      // Invalidate queries to refresh the UI
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['repositories'] }),
      ])

      onOpenChange(false)
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : 'Failed to create from template')
    }
  }

  const renderQuestionField = (question: CopierQuestion) => {
    const value = answers[question.name]
    const setValue = (v: unknown) => setAnswers((prev) => ({ ...prev, [question.name]: v }))

    const isRequired = question.default === undefined ||
      (typeof question.default === 'string' && question.default.includes('{{'))
    const labelText = isRequired ? `${question.name} *` : question.name

    switch (question.type) {
      case 'bool':
        return (
          <Field key={question.name}>
            <div className="flex items-center gap-2">
              <Checkbox checked={value as boolean} onCheckedChange={setValue} />
              <FieldLabel className="cursor-pointer">{labelText}</FieldLabel>
            </div>
            {question.help && <FieldDescription>{question.help}</FieldDescription>}
          </Field>
        )

      case 'int':
      case 'float':
        return (
          <Field key={question.name}>
            <FieldLabel>{labelText}</FieldLabel>
            <Input
              type="number"
              value={value as number}
              onChange={(e) =>
                setValue(
                  question.type === 'int' ? parseInt(e.target.value) : parseFloat(e.target.value)
                )
              }
              step={question.type === 'float' ? 'any' : 1}
            />
            {question.help && <FieldDescription>{question.help}</FieldDescription>}
          </Field>
        )

      case 'str':
      default: {
        if (question.choices && question.choices.length > 0) {
          return (
            <Field key={question.name}>
              <FieldLabel>{labelText}</FieldLabel>
              <Select value={String(value ?? '')} onValueChange={setValue}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {question.choices.map((choice) => (
                    <SelectItem key={String(choice.value)} value={String(choice.value)}>
                      {choice.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {question.help && <FieldDescription>{question.help}</FieldDescription>}
            </Field>
          )
        }

        const isMultiline = question.type === 'yaml' || question.type === 'json'
        const isPassword = question.name.toLowerCase().includes('password')
        const isPasswordVisible = visiblePasswords.has(question.name)

        return (
          <Field key={question.name}>
            <FieldLabel>{labelText}</FieldLabel>
            {isMultiline ? (
              <Textarea
                value={String(value ?? '')}
                onChange={(e) => setValue(e.target.value)}
                rows={4}
              />
            ) : isPassword ? (
              <div className="relative">
                <Input
                  type={isPasswordVisible ? 'text' : 'password'}
                  value={String(value ?? '')}
                  onChange={(e) => setValue(e.target.value)}
                  className="pr-8"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setVisiblePasswords((prev) => {
                      const next = new Set(prev)
                      if (next.has(question.name)) next.delete(question.name)
                      else next.add(question.name)
                      return next
                    })
                  }}
                >
                  <HugeiconsIcon
                    icon={isPasswordVisible ? ViewOffIcon : EyeIcon}
                    size={14}
                    strokeWidth={2}
                  />
                </button>
              </div>
            ) : (
              <Input value={String(value ?? '')} onChange={(e) => setValue(e.target.value)} />
            )}
            {question.help && <FieldDescription>{question.help}</FieldDescription>}
          </Field>
        )
      }
    }
  }

  const handleCancel = () => {
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[80dvh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>{t('addRepository')}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0 px-1">
            <div className="space-y-4">
              {/* Project selector - only shown when propProjectId is not provided */}
              {!propProjectId && (
                <div className="space-y-2">
                  <Label>Add to Project</Label>
                  {isCreatingProject ? (
                    // Inline project creation
                    <div className="flex gap-2">
                      <Input
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="New project name..."
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleCreateProject()
                          } else if (e.key === 'Escape') {
                            setIsCreatingProject(false)
                            setNewProjectName('')
                          }
                        }}
                        disabled={createProjectMutation.isPending}
                      />
                      <Button
                        size="sm"
                        onClick={handleCreateProject}
                        disabled={!newProjectName.trim() || createProjectMutation.isPending}
                      >
                        {createProjectMutation.isPending ? (
                          <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                        ) : (
                          'Create'
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setIsCreatingProject(false)
                          setNewProjectName('')
                        }}
                        disabled={createProjectMutation.isPending}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    // Project combobox
                    <Combobox
                      value={selectedProjectId}
                      onValueChange={(value) => {
                        setSelectedProjectId(value as string | null)
                        setProjectError(null)
                      }}
                    >
                      <ComboboxInput
                        placeholder={selectedProject?.name || 'Select a project...'}
                        value={projectSearchQuery}
                        onChange={(e) => setProjectSearchQuery(e.target.value)}
                        className="w-full"
                      />
                      <ComboboxContent>
                        <ComboboxList>
                          <ComboboxEmpty>No projects found</ComboboxEmpty>
                          {filteredProjects.map((project) => (
                            <ComboboxItem key={project.id} value={project.id}>
                              {project.name}
                            </ComboboxItem>
                          ))}
                        </ComboboxList>
                        <div className="border-t p-1">
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                            onClick={() => {
                              setIsCreatingProject(true)
                              setProjectSearchQuery('')
                            }}
                          >
                            <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
                            Create new project
                          </button>
                        </div>
                      </ComboboxContent>
                    </Combobox>
                  )}
                  {projectError && (
                    <div className="flex items-center gap-2 text-xs text-destructive">
                      <HugeiconsIcon icon={Alert02Icon} size={12} strokeWidth={2} />
                      {projectError}
                    </div>
                  )}
                </div>
              )}

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full">
                  <TabsTrigger value="clone" className="flex-1">
                    Clone
                  </TabsTrigger>
                  <TabsTrigger value="local" className="flex-1">
                    Local
                  </TabsTrigger>
                  <TabsTrigger value="scan" className="flex-1">
                    {t('addModal.tabs.scan')}
                  </TabsTrigger>
                  <TabsTrigger value="template" className="flex-1">
                    {t('addModal.tabs.template')}
                  </TabsTrigger>
                </TabsList>

                {/* Clone Tab */}
                <TabsContent value="clone" className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Git URL</Label>
                    <div className="relative">
                      <Input
                        value={cloneUrl}
                        onChange={(e) => {
                          setCloneUrl(e.target.value)
                          setCloneError(null)
                          if (!isGitUrl(e.target.value.trim())) {
                            setFolderName('')
                          }
                        }}
                        placeholder="https://github.com/user/repo.git"
                        disabled={isClonePending}
                        className="pr-8"
                      />
                      {cloneUrl && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <HugeiconsIcon
                            icon={Link01Icon}
                            size={14}
                            strokeWidth={2}
                            className="text-muted-foreground"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Clone options */}
                  {cloneUrl.trim() && (
                    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                      <div className="text-xs font-medium text-muted-foreground">
                        Clone Options
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Clone to directory</Label>
                        <div className="flex gap-2">
                          <Input
                            value={targetDir}
                            onChange={(e) => setTargetDir(e.target.value)}
                            placeholder={defaultGitReposDir || '~/'}
                            disabled={isClonePending}
                            className="flex-1 text-xs"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setTargetDirBrowserOpen(true)}
                            disabled={isClonePending}
                          >
                            Browse
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Folder name</Label>
                        <Input
                          value={folderName}
                          onChange={(e) => setFolderName(e.target.value)}
                          placeholder={extractedRepoName || ''}
                          disabled={isClonePending}
                          className="text-xs"
                        />
                      </div>

                      {clonePath && (
                        <div className="rounded-md bg-background px-3 py-2 text-xs text-muted-foreground">
                          Will clone to: <span className="font-mono">{clonePath}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {isClonePending && (
                    <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={16}
                        strokeWidth={2}
                        className="animate-spin"
                      />
                      Cloning repository...
                    </div>
                  )}

                  {cloneError && (
                    <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      <HugeiconsIcon
                        icon={Alert02Icon}
                        size={14}
                        strokeWidth={2}
                        className="mt-0.5 shrink-0"
                      />
                      <span>{cloneError}</span>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={handleCancel} disabled={isClonePending}>
                      {t('addModal.cancel')}
                    </Button>
                    <Button
                      onClick={() => handleClone(false)}
                      disabled={!cloneUrl.trim() || !isGitUrl(cloneUrl.trim()) || isClonePending || !projectId}
                    >
                      {isClonePending ? (
                        <>
                          <HugeiconsIcon
                            icon={Loading03Icon}
                            size={16}
                            strokeWidth={2}
                            className="animate-spin"
                          />
                          Cloning...
                        </>
                      ) : (
                        'Clone & Add'
                      )}
                    </Button>
                  </div>
                </TabsContent>

                {/* Local Tab */}
                <TabsContent value="local" className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Repository path</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          value={localPath}
                          onChange={(e) => {
                            setLocalPath(e.target.value)
                            setLocalError(null)
                          }}
                          placeholder="~/code/my-repo"
                          disabled={isLocalPending}
                          className="pr-8"
                        />
                        {localPath && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2">
                            <HugeiconsIcon
                              icon={Folder01Icon}
                              size={14}
                              strokeWidth={2}
                              className="text-muted-foreground"
                            />
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setLocalBrowserOpen(true)}
                        disabled={isLocalPending}
                      >
                        Browse
                      </Button>
                    </div>
                  </div>

                  {isLocalPending && (
                    <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={16}
                        strokeWidth={2}
                        className="animate-spin"
                      />
                      Adding repository...
                    </div>
                  )}

                  {localError && (
                    <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      <HugeiconsIcon
                        icon={Alert02Icon}
                        size={14}
                        strokeWidth={2}
                        className="mt-0.5 shrink-0"
                      />
                      <span>{localError}</span>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={handleCancel} disabled={isLocalPending}>
                      {t('addModal.cancel')}
                    </Button>
                    <Button
                      onClick={() => handleAddLocal(false)}
                      disabled={!localPath.trim() || isLocalPending || !projectId}
                    >
                      {isLocalPending ? (
                        <>
                          <HugeiconsIcon
                            icon={Loading03Icon}
                            size={16}
                            strokeWidth={2}
                            className="animate-spin"
                          />
                          Adding...
                        </>
                      ) : (
                        t('addModal.add')
                      )}
                    </Button>
                  </div>
                </TabsContent>

                {/* Scan Tab */}
                <TabsContent value="scan" className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>{t('bulkAdd.directoryLabel')}</Label>
                    <div className="flex gap-2">
                      <Input
                        value={scanDirectory}
                        onChange={(e) => {
                          setScanDirectory(e.target.value)
                          setScanError(null)
                          setScannedRepos(null)
                        }}
                        placeholder={defaultGitReposDir || t('bulkAdd.directoryPlaceholder')}
                        disabled={isScanPending}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setScanBrowserOpen(true)}
                        disabled={isScanPending}
                      >
                        {t('bulkAdd.browse')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleScan}
                        disabled={isScanPending || !effectiveScanDirectory}
                      >
                        {scanMutation.isPending ? (
                          <HugeiconsIcon
                            icon={Loading03Icon}
                            size={16}
                            strokeWidth={2}
                            className="animate-spin"
                          />
                        ) : (
                          <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={2} />
                        )}
                        {t('bulkAdd.scan')}
                      </Button>
                    </div>
                  </div>

                  {/* Scan results */}
                  {scannedRepos !== null && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">
                          {t('bulkAdd.foundRepos', { count: scannedRepos.length })}
                        </Label>
                        {addableRepos.length > 0 && (
                          <div className="flex gap-2 text-xs">
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={handleSelectAll}
                              disabled={isScanPending}
                            >
                              {t('bulkAdd.selectAll')}
                            </button>
                            <span className="text-muted-foreground">/</span>
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={handleSelectNone}
                              disabled={isScanPending}
                            >
                              {t('bulkAdd.selectNone')}
                            </button>
                          </div>
                        )}
                      </div>

                      {scannedRepos.length === 0 ? (
                        <div className="rounded-md bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">
                          {t('bulkAdd.noReposFound')}
                        </div>
                      ) : (
                        <div className="max-h-64 overflow-y-auto rounded-md border">
                          {scannedRepos.map((repo) => (
                            <div
                              key={repo.path}
                              className={`flex items-center gap-3 border-b px-3 py-2 last:border-b-0 ${
                                repo.hasProject ? 'bg-muted/30 opacity-60' : ''
                              }`}
                            >
                              <Checkbox
                                checked={selectedPaths.has(repo.path)}
                                onCheckedChange={() => handleToggle(repo.path)}
                                disabled={repo.hasProject || isScanPending}
                              />
                              <HugeiconsIcon
                                icon={repo.hasProject ? CheckmarkCircle02Icon : Folder01Icon}
                                size={16}
                                strokeWidth={2}
                                className={repo.hasProject ? 'text-green-500' : 'text-muted-foreground'}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">{repo.name}</div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {repo.path}
                                </div>
                              </div>
                              {repo.hasProject && (
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {t('bulkAdd.alreadyAdded')}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Adding state */}
                  {addRepositoryMutation.isPending && activeTab === 'scan' && (
                    <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={16}
                        strokeWidth={2}
                        className="animate-spin"
                      />
                      {t('bulkAdd.adding')}
                    </div>
                  )}

                  {/* Error state */}
                  {scanError && (
                    <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      <HugeiconsIcon
                        icon={Alert02Icon}
                        size={14}
                        strokeWidth={2}
                        className="mt-0.5 shrink-0"
                      />
                      <span>{scanError}</span>
                    </div>
                  )}

                  {selectedPaths.size > 0 && (
                    <Button
                      onClick={handleBulkAdd}
                      disabled={selectedPaths.size === 0 || isScanPending || addRepositoryMutation.isPending || !projectId}
                      className="w-full"
                    >
                      {t('bulkAdd.addSelected', { count: selectedPaths.size })}
                    </Button>
                  )}
                </TabsContent>

                {/* Template Tab */}
                <TabsContent value="template" className="space-y-4 pt-4">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">
                      {t('newProject.steps.template.sectionTitle')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('newProject.steps.template.sectionDescription')}{' '}
                      <a
                        href="https://copier.readthedocs.io/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:opacity-80"
                      >
                        {t('newProject.steps.template.learnMore')}
                      </a>
                    </div>
                  </div>
                  <FieldGroup>
                    <Field>
                      <FieldLabel>{t('newProject.steps.template.savedTemplates')}</FieldLabel>
                      <div className="flex gap-2">
                        <Select
                          value={templateSource}
                          onValueChange={(v) => {
                            setTemplateSource(v ?? '')
                            setCustomTemplateUrl('')
                            setAnswers({})
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue>
                              {templateSource ? (
                                templates?.find((t) => t.id === templateSource)?.displayName
                              ) : (
                                <span className="text-muted-foreground">
                                  {t('newProject.steps.template.selectTemplate')}
                                </span>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {templates?.map((repo) => (
                              <SelectItem key={repo.id} value={repo.id}>
                                {repo.displayName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {templateSource && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setTemplateSource('')
                              setAnswers({})
                            }}
                            disabled={isTemplatePending}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    </Field>

                    {!templateSource && (
                      <>
                        <div className="text-center text-muted-foreground text-xs py-1">
                          {t('newProject.steps.template.or')}
                        </div>

                        <Field>
                          <FieldLabel>{t('newProject.steps.template.customUrl')}</FieldLabel>
                          <Input
                            value={customTemplateUrl}
                            onChange={(e) => {
                              setCustomTemplateUrl(e.target.value)
                              setTemplateSource('')
                              setAnswers({})
                            }}
                            placeholder="https://github.com/user/template or /path/to/template"
                            disabled={isTemplatePending}
                          />
                        </Field>
                      </>
                    )}
                  </FieldGroup>

                  {/* Template Questions */}
                  {effectiveTemplateSource && (
                    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                      <div className="text-xs font-medium text-muted-foreground">
                        {t('newProject.steps.questions.title')}
                      </div>

                      {questionsLoading && (
                        <div className="flex items-center justify-center py-4">
                          <HugeiconsIcon
                            icon={Loading03Icon}
                            size={20}
                            strokeWidth={2}
                            className="animate-spin text-muted-foreground"
                          />
                        </div>
                      )}

                      {questionsError && (
                        <div className="text-destructive text-sm py-2">{questionsError.message}</div>
                      )}

                      {questionsData && (
                        <FieldGroup>
                          {questionsData.questions.length === 0 ? (
                            <div className="text-muted-foreground text-sm py-2">
                              {t('newProject.steps.questions.noQuestions')}
                            </div>
                          ) : (
                            questionsData.questions.map(renderQuestionField)
                          )}
                        </FieldGroup>
                      )}
                    </div>
                  )}

                  {/* Output Location */}
                  {effectiveTemplateSource && !questionsLoading && (
                    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                      <div className="text-xs font-medium text-muted-foreground">
                        {t('newProject.steps.output.title')}
                      </div>

                      <Field>
                        <FieldLabel>{t('newProject.steps.output.projectName')}</FieldLabel>
                        <Input
                          value={templateProjectName}
                          onChange={(e) => setTemplateProjectName(e.target.value)}
                          placeholder="my-new-project"
                          disabled={isTemplatePending}
                        />
                      </Field>

                      <Field>
                        <FieldLabel>{t('newProject.steps.output.outputDirectory')}</FieldLabel>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full justify-start font-normal"
                          onClick={() => setOutputBrowserOpen(true)}
                          disabled={isTemplatePending}
                        >
                          <HugeiconsIcon
                            icon={Folder01Icon}
                            size={14}
                            strokeWidth={2}
                            className="mr-2"
                          />
                          {outputPath || t('newProject.steps.output.selectDirectory')}
                        </Button>
                      </Field>

                      {templateProjectName && outputPath && (
                        <FieldDescription className="font-mono text-xs">
                          {t('newProject.steps.output.willCreate')}: {outputPath}/{templateProjectName}
                        </FieldDescription>
                      )}
                    </div>
                  )}

                  {isTemplatePending && (
                    <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={16}
                        strokeWidth={2}
                        className="animate-spin"
                      />
                      {t('newProject.steps.creating.inProgress')}
                    </div>
                  )}

                  {templateError && (
                    <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      <HugeiconsIcon
                        icon={Alert02Icon}
                        size={14}
                        strokeWidth={2}
                        className="mt-0.5 shrink-0"
                      />
                      <span>{templateError}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="trust-template"
                        checked={trust}
                        onCheckedChange={(checked) => setTrust(checked === true)}
                        disabled={isTemplatePending}
                      />
                      <label
                        htmlFor="trust-template"
                        className="text-xs text-muted-foreground cursor-pointer"
                      >
                        {t('newProject.steps.output.trust')}
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handleCancel} disabled={isTemplatePending}>
                        {t('addModal.cancel')}
                      </Button>
                      <Button
                        onClick={handleCreateFromTemplate}
                        disabled={!canCreateFromTemplate || isTemplatePending || !projectId}
                      >
                        Create & Add
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Conflict dialog */}
      <AlertDialog
        open={conflictDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setConflictDialog({ open: false, conflict: null, pendingAction: null })
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Repository Already Assigned</AlertDialogTitle>
            <AlertDialogDescription>
              This repository is already in project "{conflictDialog.conflict?.conflictProject?.name}".
              Would you like to move it to this project instead?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                conflictDialog.pendingAction?.()
                setConflictDialog({ open: false, conflict: null, pendingAction: null })
              }}
            >
              Move to This Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Filesystem browsers */}
      <FilesystemBrowser
        open={targetDirBrowserOpen}
        onOpenChange={setTargetDirBrowserOpen}
        onSelect={(path) => {
          setTargetDir(path)
          setTargetDirBrowserOpen(false)
        }}
        initialPath={effectiveTargetDir || undefined}
      />
      <FilesystemBrowser
        open={localBrowserOpen}
        onOpenChange={setLocalBrowserOpen}
        onSelect={(path) => {
          setLocalPath(path)
          setLocalBrowserOpen(false)
        }}
        initialPath={defaultGitReposDir || undefined}
      />
      <FilesystemBrowser
        open={scanBrowserOpen}
        onOpenChange={setScanBrowserOpen}
        onSelect={(path) => {
          setScanDirectory(path)
          setScanBrowserOpen(false)
          setScannedRepos(null)
          setSelectedPaths(new Set())
        }}
        initialPath={effectiveScanDirectory || undefined}
      />
      <FilesystemBrowser
        open={outputBrowserOpen}
        onOpenChange={setOutputBrowserOpen}
        onSelect={(path) => {
          setOutputPath(path)
          setOutputBrowserOpen(false)
        }}
        initialPath={outputPath || defaultGitReposDir || undefined}
      />
    </>
  )
}
