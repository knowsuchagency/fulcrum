import { useState, useMemo, useEffect } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  useRepositories,
  useCreateRepository,
  useCloneRepository,
} from '@/hooks/use-repositories'
import {
  useCopierTemplates,
  useCopierQuestions,
  useCreateProjectFromTemplate,
} from '@/hooks/use-copier'
import {
  useCreateProject,
  useBulkCreateProjects,
  useScanProjects,
  type ScannedProject,
} from '@/hooks/use-projects'
import { useFindCompose } from '@/hooks/use-apps'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FilesystemBrowser } from '@/components/ui/filesystem-browser'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Loading03Icon,
  Alert02Icon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
  Search01Icon,
  Folder01Icon,
  Link01Icon,
} from '@hugeicons/core-free-icons'
import { fuzzyScore } from '@/lib/fuzzy-search'
import { useDefaultGitReposDir } from '@/hooks/use-config'
import type { Repository, CopierQuestion } from '@/types'

interface NewProjectSearch {
  repoId?: string
  tab?: 'add' | 'scan' | 'template'
  templateSource?: string
}

export const Route = createFileRoute('/projects/new')({
  component: NewProjectWizard,
  validateSearch: (search: Record<string, unknown>): NewProjectSearch => ({
    repoId: typeof search.repoId === 'string' ? search.repoId : undefined,
    tab: ['add', 'scan', 'template'].includes(search.tab as string)
      ? (search.tab as 'add' | 'scan' | 'template')
      : undefined,
    templateSource: typeof search.templateSource === 'string' ? search.templateSource : undefined,
  }),
})

type Step = 'select-repo' | 'configure-project'

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

function NewProjectWizard() {
  const { t } = useTranslation('projects')
  const { t: tRepos } = useTranslation('repositories')
  const navigate = useNavigate()
  const { repoId, tab: initialTab, templateSource: initialTemplateSource } = Route.useSearch()
  const { data: repositories, isLoading: reposLoading } = useRepositories()
  const { data: defaultGitReposDir } = useDefaultGitReposDir()
  const createProject = useCreateProject()
  const createRepository = useCreateRepository()
  const cloneRepository = useCloneRepository()
  const scanMutation = useScanProjects()
  const bulkCreateMutation = useBulkCreateProjects()

  // Main tab state
  const [activeTab, setActiveTab] = useState<string>(
    initialTemplateSource ? 'template' : initialTab || 'add'
  )
  const [step, setStep] = useState<Step>('select-repo')
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Add tab state
  const [newRepoInput, setNewRepoInput] = useState('')
  const [targetDir, setTargetDir] = useState('')
  const [folderName, setFolderName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [inputBrowserOpen, setInputBrowserOpen] = useState(false)
  const [targetDirBrowserOpen, setTargetDirBrowserOpen] = useState(false)

  // Scan tab state
  const [scanDirectory, setScanDirectory] = useState('')
  const [scannedRepos, setScannedRepos] = useState<ScannedProject[] | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanBrowserOpen, setScanBrowserOpen] = useState(false)

  // Template tab state
  const [templateSource, setTemplateSource] = useState(initialTemplateSource ?? '')
  const [customTemplateUrl, setCustomTemplateUrl] = useState('')
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [outputPath, setOutputPath] = useState('')
  const [templateProjectName, setTemplateProjectName] = useState('')
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [trust, setTrust] = useState(true)
  const [outputBrowserOpen, setOutputBrowserOpen] = useState(false)

  // Step 2 state
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [setupApp, setSetupApp] = useState(true)

  // Template tab queries
  const { data: templates } = useCopierTemplates()
  const effectiveTemplateSource = templateSource || customTemplateUrl
  const {
    data: questionsData,
    isLoading: questionsLoading,
    error: questionsError,
  } = useCopierQuestions(activeTab === 'template' && effectiveTemplateSource ? effectiveTemplateSource : null)
  const createProjectFromTemplate = useCreateProjectFromTemplate()

  // Auto-select repository if repoId is provided in URL
  useEffect(() => {
    if (repoId && repositories && !selectedRepo) {
      const repo = repositories.find((r) => r.id === repoId)
      if (repo) {
        setSelectedRepo(repo)
        setProjectName(repo.displayName)
      }
    }
  }, [repoId, repositories, selectedRepo])

  // Fetch compose info for selected repo
  const { data: composeInfo, isLoading: composeLoading } = useFindCompose(
    selectedRepo?.id ?? null
  )

  // Computed values for add repo
  const isUrl = useMemo(() => isGitUrl(newRepoInput.trim()), [newRepoInput])
  const extractedRepoName = useMemo(
    () => (isUrl ? extractRepoNameFromUrl(newRepoInput.trim()) : null),
    [newRepoInput, isUrl]
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
    if (!isUrl || !effectiveTargetDir) return null
    const name = folderName.trim() || extractedRepoName || ''
    if (!name) return null
    return `${effectiveTargetDir}/${name}`
  }, [isUrl, effectiveTargetDir, folderName, extractedRepoName])

  // Filter repositories
  const filteredRepos = useMemo(() => {
    if (!repositories) return []
    if (!searchQuery?.trim()) return repositories
    return repositories
      .map((repo) => ({
        repo,
        score: Math.max(fuzzyScore(repo.displayName, searchQuery), fuzzyScore(repo.path, searchQuery)),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ repo }) => repo)
  }, [repositories, searchQuery])

  // Scan tab computed values - repos that don't have projects yet can be added
  const addableRepos = useMemo(
    () => scannedRepos?.filter((r) => !r.hasProject) ?? [],
    [scannedRepos]
  )

  const isAddPending = createRepository.isPending || cloneRepository.isPending
  const isScanPending = scanMutation.isPending || bulkCreateMutation.isPending
  const isTemplatePending = createProjectFromTemplate.isPending

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

  // Handle repo selection
  const handleSelectRepo = (repo: Repository) => {
    setSelectedRepo(repo)
    setProjectName(repo.displayName)
  }

  // Handle adding a new repo
  const handleAddRepo = async () => {
    setAddError(null)
    const value = newRepoInput.trim()
    if (!value) return

    try {
      let repo: Repository
      if (isUrl) {
        repo = await cloneRepository.mutateAsync({
          url: value,
          targetDir: targetDir.trim() || undefined,
          folderName: folderName.trim() || undefined,
        })
      } else {
        const displayName = value.split('/').pop() || 'repo'
        repo = await createRepository.mutateAsync({ path: value, displayName })
      }
      setSelectedRepo(repo)
      setProjectName(repo.displayName)
      setNewRepoInput('')
      setTargetDir('')
      setFolderName('')
    } catch (err) {
      setAddError(err instanceof Error ? err.message : t('newProject.addRepoFailed'))
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
        setScanError(err instanceof Error ? err.message : tRepos('bulkAdd.scanFailed'))
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
    if (selectedPaths.size === 0) return

    const repos = Array.from(selectedPaths).map((path) => {
      const repo = scannedRepos?.find((r) => r.path === path)
      return { path, displayName: repo?.name }
    })

    bulkCreateMutation.mutate(repos, {
      onSuccess: () => {
        // Navigate to projects list after adding repos
        navigate({ to: '/projects' })
      },
      onError: (err) => {
        setScanError(err instanceof Error ? err.message : tRepos('bulkAdd.addFailed'))
      },
    })
  }

  // Template handlers
  const shouldTrust = !!templateSource || trust

  const handleCreateFromTemplate = () => {
    setTemplateError(null)
    createProjectFromTemplate.mutate(
      {
        templateSource: effectiveTemplateSource,
        outputPath,
        answers,
        projectName: templateProjectName,
        trust: shouldTrust,
      },
      {
        onSuccess: (result) => {
          // Navigate to the newly created project
          navigate({ to: '/projects/$projectId', params: { projectId: result.projectId } })
        },
        onError: (error) => {
          setTemplateError(error.message)
        },
      }
    )
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

        return (
          <Field key={question.name}>
            <FieldLabel>{labelText}</FieldLabel>
            {isMultiline ? (
              <Textarea
                value={String(value ?? '')}
                onChange={(e) => setValue(e.target.value)}
                rows={4}
              />
            ) : (
              <Input value={String(value ?? '')} onChange={(e) => setValue(e.target.value)} />
            )}
            {question.help && <FieldDescription>{question.help}</FieldDescription>}
          </Field>
        )
      }
    }
  }

  // Proceed to step 2
  const handleNextStep = () => {
    setStep('configure-project')
  }

  // Create project
  const handleCreateProject = async () => {
    if (!selectedRepo) return

    try {
      const result = await createProject.mutateAsync({
        name: projectName,
        description: projectDescription || undefined,
        repositoryId: selectedRepo.id,
      })

      // If setupApp is checked and compose exists, navigate to project with action to add app
      if (setupApp && composeInfo?.found) {
        navigate({ to: '/projects/$projectId', params: { projectId: result.id }, search: { tab: 'app', action: 'deploy' } })
      } else {
        navigate({ to: '/projects/$projectId', params: { projectId: result.id } })
      }
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
        <Link to="/projects" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
          <span className="text-sm">{t('title')}</span>
        </Link>
        <div className="flex-1" />
        {activeTab !== 'template' && (
          <div className="text-sm text-muted-foreground">
            {t('newProject.step', { current: step === 'select-repo' ? 1 : 2, total: 2 })}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Template tab goes directly to creation (no step 2) */}
        {activeTab === 'template' ? (
          <div className="mx-auto max-w-2xl">
            <Card>
              <CardHeader>
                <CardTitle>{tRepos('addModal.tabs.template')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="w-full">
                    <TabsTrigger value="add" className="flex-1">
                      {tRepos('addModal.tabs.add')}
                    </TabsTrigger>
                    <TabsTrigger value="scan" className="flex-1">
                      {tRepos('addModal.tabs.scan')}
                    </TabsTrigger>
                    <TabsTrigger value="template" className="flex-1">
                      {tRepos('addModal.tabs.template')}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Template Source */}
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    {tRepos('newProject.steps.template.sectionTitle')}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {tRepos('newProject.steps.template.sectionDescription')}{' '}
                    <a
                      href="https://copier.readthedocs.io/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:opacity-80"
                    >
                      {tRepos('newProject.steps.template.learnMore')}
                    </a>
                  </div>
                </div>
                <FieldGroup>
                  <Field>
                    <FieldLabel>{tRepos('newProject.steps.template.savedTemplates')}</FieldLabel>
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
                                {tRepos('newProject.steps.template.selectTemplate')}
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
                        {tRepos('newProject.steps.template.or')}
                      </div>

                      <Field>
                        <FieldLabel>{tRepos('newProject.steps.template.customUrl')}</FieldLabel>
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
                      {tRepos('newProject.steps.questions.title')}
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
                            {tRepos('newProject.steps.questions.noQuestions')}
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
                      {tRepos('newProject.steps.output.title')}
                    </div>

                    <Field>
                      <FieldLabel>{tRepos('newProject.steps.output.projectName')}</FieldLabel>
                      <Input
                        value={templateProjectName}
                        onChange={(e) => setTemplateProjectName(e.target.value)}
                        placeholder="my-new-project"
                        disabled={isTemplatePending}
                      />
                    </Field>

                    <Field>
                      <FieldLabel>{tRepos('newProject.steps.output.outputDirectory')}</FieldLabel>
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
                        {outputPath || tRepos('newProject.steps.output.selectDirectory')}
                      </Button>
                    </Field>

                    {templateProjectName && outputPath && (
                      <FieldDescription className="font-mono text-xs">
                        {tRepos('newProject.steps.output.willCreate')}: {outputPath}/{templateProjectName}
                      </FieldDescription>
                    )}
                  </div>
                )}

                {/* Creating state */}
                {isTemplatePending && (
                  <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      size={16}
                      strokeWidth={2}
                      className="animate-spin"
                    />
                    {tRepos('newProject.steps.creating.inProgress')}
                  </div>
                )}

                {/* Error state */}
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

                {/* Actions */}
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
                      {tRepos('newProject.steps.output.trust')}
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Link to="/projects">
                      <Button variant="outline" disabled={isTemplatePending}>
                        {t('newProject.cancel')}
                      </Button>
                    </Link>
                    <Button
                      onClick={handleCreateFromTemplate}
                      disabled={!canCreateFromTemplate || isTemplatePending}
                    >
                      {tRepos('newProject.create')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : step === 'select-repo' ? (
          <div className="mx-auto max-w-2xl">
            <Card>
              <CardHeader>
                <CardTitle>{t('newProject.selectRepository')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="w-full">
                    <TabsTrigger value="add" className="flex-1">
                      {tRepos('addModal.tabs.add')}
                    </TabsTrigger>
                    <TabsTrigger value="scan" className="flex-1">
                      {tRepos('addModal.tabs.scan')}
                    </TabsTrigger>
                    <TabsTrigger value="template" className="flex-1">
                      {tRepos('addModal.tabs.template')}
                    </TabsTrigger>
                  </TabsList>

                  {/* Add Tab */}
                  <TabsContent value="add" className="space-y-4 pt-4">
                    {/* Search existing repos */}
                    <div className="relative">
                      <HugeiconsIcon
                        icon={Search01Icon}
                        size={14}
                        strokeWidth={2}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('newProject.searchRepos')}
                        className="pl-9"
                      />
                    </div>

                    {/* Repository list */}
                    {reposLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          size={24}
                          strokeWidth={2}
                          className="animate-spin text-muted-foreground"
                        />
                      </div>
                    ) : filteredRepos.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-auto">
                        {filteredRepos.map((repo) => (
                          <RepoOption
                            key={repo.id}
                            repo={repo}
                            selected={selectedRepo?.id === repo.id}
                            onSelect={() => handleSelectRepo(repo)}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        {t('newProject.noReposFound')}
                      </p>
                    )}

                    {/* Divider */}
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">or add new</span>
                      </div>
                    </div>

                    {/* Add new repo input */}
                    <div className="space-y-2">
                      <Label>{t('newProject.repoPathOrUrl')}</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            value={newRepoInput}
                            onChange={(e) => {
                              setNewRepoInput(e.target.value)
                              setAddError(null)
                              if (!isGitUrl(e.target.value.trim())) {
                                setFolderName('')
                              }
                            }}
                            placeholder={t('newProject.repoInputPlaceholder')}
                            disabled={isAddPending}
                            className="pr-8"
                          />
                          {newRepoInput && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2">
                              <HugeiconsIcon
                                icon={isUrl ? Link01Icon : Folder01Icon}
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
                          onClick={() => setInputBrowserOpen(true)}
                          disabled={isAddPending}
                        >
                          {t('newProject.browse')}
                        </Button>
                      </div>
                    </div>

                    {/* Clone options - shown when URL is detected */}
                    {isUrl && (
                      <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                        <div className="text-xs font-medium text-muted-foreground">
                          {t('newProject.cloneOptions')}
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">{t('newProject.targetDirectory')}</Label>
                          <div className="flex gap-2">
                            <Input
                              value={targetDir}
                              onChange={(e) => setTargetDir(e.target.value)}
                              placeholder={defaultGitReposDir || '~/'}
                              disabled={isAddPending}
                              className="flex-1 text-xs"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setTargetDirBrowserOpen(true)}
                              disabled={isAddPending}
                            >
                              {t('newProject.browse')}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">{t('newProject.folderName')}</Label>
                          <Input
                            value={folderName}
                            onChange={(e) => setFolderName(e.target.value)}
                            placeholder={extractedRepoName || ''}
                            disabled={isAddPending}
                            className="text-xs"
                          />
                        </div>

                        {clonePath && (
                          <div className="rounded-md bg-background px-3 py-2 text-xs text-muted-foreground">
                            {t('newProject.willCloneTo')}: <span className="font-mono">{clonePath}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {isAddPending && (
                      <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          size={16}
                          strokeWidth={2}
                          className="animate-spin"
                        />
                        {isUrl ? t('newProject.cloning') : t('newProject.adding')}
                      </div>
                    )}

                    {addError && (
                      <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        <HugeiconsIcon
                          icon={Alert02Icon}
                          size={14}
                          strokeWidth={2}
                          className="mt-0.5 shrink-0"
                        />
                        <span>{addError}</span>
                      </div>
                    )}

                    {newRepoInput.trim() && (
                      <Button
                        onClick={handleAddRepo}
                        disabled={!newRepoInput.trim() || isAddPending}
                        className="w-full"
                      >
                        {isUrl ? t('newProject.cloneAndSelect') : t('newProject.addAndSelect')}
                      </Button>
                    )}
                  </TabsContent>

                  {/* Scan Tab */}
                  <TabsContent value="scan" className="space-y-4 pt-4">
                    {/* Directory input */}
                    <div className="space-y-2">
                      <Label>{tRepos('bulkAdd.directoryLabel')}</Label>
                      <div className="flex gap-2">
                        <Input
                          value={scanDirectory}
                          onChange={(e) => {
                            setScanDirectory(e.target.value)
                            setScanError(null)
                            setScannedRepos(null)
                          }}
                          placeholder={defaultGitReposDir || tRepos('bulkAdd.directoryPlaceholder')}
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
                          {tRepos('bulkAdd.browse')}
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
                          {tRepos('bulkAdd.scan')}
                        </Button>
                      </div>
                    </div>

                    {/* Scan results */}
                    {scannedRepos !== null && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">
                            {tRepos('bulkAdd.foundRepos', { count: scannedRepos.length })}
                          </Label>
                          {addableRepos.length > 0 && (
                            <div className="flex gap-2 text-xs">
                              <button
                                type="button"
                                className="text-primary hover:underline"
                                onClick={handleSelectAll}
                                disabled={isScanPending}
                              >
                                {tRepos('bulkAdd.selectAll')}
                              </button>
                              <span className="text-muted-foreground">/</span>
                              <button
                                type="button"
                                className="text-primary hover:underline"
                                onClick={handleSelectNone}
                                disabled={isScanPending}
                              >
                                {tRepos('bulkAdd.selectNone')}
                              </button>
                            </div>
                          )}
                        </div>

                        {scannedRepos.length === 0 ? (
                          <div className="rounded-md bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">
                            {tRepos('bulkAdd.noReposFound')}
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
                                    {tRepos('bulkAdd.alreadyAdded')}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Adding state */}
                    {bulkCreateMutation.isPending && (
                      <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          size={16}
                          strokeWidth={2}
                          className="animate-spin"
                        />
                        {tRepos('bulkAdd.adding')}
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
                        disabled={selectedPaths.size === 0 || isScanPending}
                        className="w-full"
                      >
                        {tRepos('bulkAdd.addSelected', { count: selectedPaths.size })}
                      </Button>
                    )}
                  </TabsContent>
                </Tabs>

                {/* Selected repo compose status */}
                {selectedRepo && (
                  <div className="rounded-lg border bg-muted/50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium">{selectedRepo.displayName}</span>
                    </div>
                    {composeLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="animate-spin" />
                        <span className="text-sm">{t('newProject.checkingCompose')}</span>
                      </div>
                    ) : composeInfo?.found ? (
                      <div className="flex items-center gap-2 text-green-600">
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={2} />
                        <span className="text-sm">
                          {t('newProject.composeFound', { file: composeInfo.file })}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
                        <span className="text-sm">{t('newProject.noCompose')}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2">
                  <Link to="/projects">
                    <Button variant="outline">{t('newProject.cancel')}</Button>
                  </Link>
                  <Button
                    onClick={handleNextStep}
                    disabled={!selectedRepo}
                  >
                    {t('newProject.next')}
                    <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl">
            <Card>
              <CardHeader>
                <CardTitle>{t('newProject.configureProject')}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {selectedRepo?.displayName}
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Project name */}
                <div className="space-y-2">
                  <Label htmlFor="projectName">{t('newProject.projectName')}</Label>
                  <Input
                    id="projectName"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder={t('newProject.projectNamePlaceholder')}
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="projectDescription">{t('newProject.description')}</Label>
                  <Textarea
                    id="projectDescription"
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                    placeholder={t('newProject.descriptionPlaceholder')}
                    rows={3}
                  />
                </div>

                {/* App setup option */}
                {composeInfo?.found && (
                  <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-green-600">
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={2} />
                      <span className="text-sm font-medium">
                        {t('newProject.composeDetected', { file: composeInfo.file })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="setupApp"
                        checked={setupApp}
                        onCheckedChange={(checked) => setSetupApp(checked === true)}
                      />
                      <Label htmlFor="setupApp" className="cursor-pointer">
                        {t('newProject.setupAppNow')}
                      </Label>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-between gap-2">
                  <Button variant="outline" onClick={() => setStep('select-repo')}>
                    <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
                    {t('newProject.back')}
                  </Button>
                  <Button
                    onClick={handleCreateProject}
                    disabled={!projectName || createProject.isPending}
                  >
                    {createProject.isPending ? (
                      <>
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          size={16}
                          strokeWidth={2}
                          className="animate-spin"
                        />
                        {t('newProject.creating')}
                      </>
                    ) : (
                      t('newProject.createProject')
                    )}
                  </Button>
                </div>

                {createProject.error && (
                  <div className="flex items-center gap-2 text-destructive">
                    <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} />
                    <span className="text-sm">{createProject.error.message}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Filesystem browsers */}
      <FilesystemBrowser
        open={inputBrowserOpen}
        onOpenChange={setInputBrowserOpen}
        onSelect={(path) => {
          setNewRepoInput(path)
          setInputBrowserOpen(false)
        }}
        initialPath={defaultGitReposDir || undefined}
      />
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
    </div>
  )
}

function RepoOption({
  repo,
  selected,
  onSelect,
}: {
  repo: Repository
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-3 text-left transition-colors ${
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-foreground/20 hover:bg-muted/50'
      }`}
    >
      <div className="font-medium">{repo.displayName}</div>
      <div className="text-xs text-muted-foreground font-mono truncate">{repo.path}</div>
    </button>
  )
}
