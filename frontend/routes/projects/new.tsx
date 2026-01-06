import { useState, useMemo, useEffect } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useRepositories, useCreateRepository, useCloneRepository } from '@/hooks/use-repositories'
import { useCreateProject } from '@/hooks/use-projects'
import { useFindCompose } from '@/hooks/use-apps'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FilesystemBrowser } from '@/components/ui/filesystem-browser'
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
import type { Repository } from '@/types'

interface NewProjectSearch {
  repoId?: string
}

export const Route = createFileRoute('/projects/new')({
  component: NewProjectWizard,
  validateSearch: (search: Record<string, unknown>): NewProjectSearch => ({
    repoId: typeof search.repoId === 'string' ? search.repoId : undefined,
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
  const navigate = useNavigate()
  const { repoId } = Route.useSearch()
  const { data: repositories, isLoading: reposLoading } = useRepositories()
  const { data: defaultGitReposDir } = useDefaultGitReposDir()
  const createProject = useCreateProject()
  const createRepository = useCreateRepository()
  const cloneRepository = useCloneRepository()

  const [step, setStep] = useState<Step>('select-repo')
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Add new repo state
  const [addTab, setAddTab] = useState<'existing' | 'add'>('existing')
  const [newRepoInput, setNewRepoInput] = useState('')
  const [targetDir, setTargetDir] = useState('')
  const [folderName, setFolderName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [inputBrowserOpen, setInputBrowserOpen] = useState(false)
  const [targetDirBrowserOpen, setTargetDirBrowserOpen] = useState(false)

  // Step 2 state
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [setupApp, setSetupApp] = useState(true)

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

  const isAddPending = createRepository.isPending || cloneRepository.isPending

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
      setAddTab('existing')
      setNewRepoInput('')
      setTargetDir('')
      setFolderName('')
    } catch (err) {
      setAddError(err instanceof Error ? err.message : t('newProject.addRepoFailed'))
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
        <div className="text-sm text-muted-foreground">
          {t('newProject.step', { current: step === 'select-repo' ? 1 : 2, total: 2 })}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {step === 'select-repo' ? (
          <div className="mx-auto max-w-2xl">
            <Card>
              <CardHeader>
                <CardTitle>{t('newProject.selectRepository')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs value={addTab} onValueChange={(v) => setAddTab(v as 'existing' | 'add')}>
                  <TabsList className="w-full">
                    <TabsTrigger value="existing" className="flex-1">
                      {t('newProject.existingRepo')}
                    </TabsTrigger>
                    <TabsTrigger value="add" className="flex-1">
                      {t('newProject.addNewRepo')}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="existing" className="space-y-4 pt-4">
                    {/* Search */}
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
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-auto">
                        {filteredRepos.map((repo) => (
                          <RepoOption
                            key={repo.id}
                            repo={repo}
                            selected={selectedRepo?.id === repo.id}
                            onSelect={() => handleSelectRepo(repo)}
                          />
                        ))}
                        {filteredRepos.length === 0 && (
                          <p className="py-4 text-center text-sm text-muted-foreground">
                            {t('newProject.noReposFound')}
                          </p>
                        )}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="add" className="space-y-4 pt-4">
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

                    <Button
                      onClick={handleAddRepo}
                      disabled={!newRepoInput.trim() || isAddPending}
                      className="w-full"
                    >
                      {isUrl ? t('newProject.cloneAndSelect') : t('newProject.addAndSelect')}
                    </Button>
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
