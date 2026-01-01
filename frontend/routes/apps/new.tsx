import { useState, useMemo, useEffect } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useRepositories } from '@/hooks/use-repositories'
import { useParseCompose, useFindCompose, useCreateApp } from '@/hooks/use-apps'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Loading03Icon,
  Alert02Icon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { fuzzyScore } from '@/lib/fuzzy-search'
import type { Repository, ComposeService } from '@/types'

interface NewAppSearch {
  repoId?: string
}

export const Route = createFileRoute('/apps/new')({
  component: CreateAppWizard,
  validateSearch: (search: Record<string, unknown>): NewAppSearch => ({
    repoId: typeof search.repoId === 'string' ? search.repoId : undefined,
  }),
})

type Step = 'select-repo' | 'configure-services'

interface ServiceConfig {
  serviceName: string
  containerPort: number | null
  exposed: boolean
  domain: string
}

function CreateAppWizard() {
  const navigate = useNavigate()
  const { repoId } = Route.useSearch()
  const { data: repositories, isLoading: reposLoading } = useRepositories()
  const createApp = useCreateApp()

  const [step, setStep] = useState<Step>('select-repo')
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Step 2 state (declared before useEffect that uses them)
  const [appName, setAppName] = useState('')
  const [branch, setBranch] = useState('main')
  const [autoDeployEnabled, setAutoDeployEnabled] = useState(false)
  const [services, setServices] = useState<ServiceConfig[]>([])

  // Auto-select repository if repoId is provided in URL
  useEffect(() => {
    if (repoId && repositories && !selectedRepo) {
      const repo = repositories.find((r) => r.id === repoId)
      if (repo) {
        setSelectedRepo(repo)
        setAppName(repo.displayName)
      }
    }
  }, [repoId, repositories, selectedRepo, setAppName])

  // Fetch compose info for selected repo
  const { data: composeInfo, isLoading: composeLoading, error: composeError } = useFindCompose(
    selectedRepo?.id ?? null
  )
  const { data: parsedCompose, isLoading: parseLoading } = useParseCompose(
    composeInfo?.found ? selectedRepo?.id ?? null : null
  )

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

  // Initialize services when compose is parsed
  const initializeServices = (composeServices: ComposeService[]) => {
    setServices(
      composeServices.map((s) => ({
        serviceName: s.name,
        containerPort: s.ports?.[0]?.container ?? null,
        exposed: false,
        domain: '',
      }))
    )
  }

  // Handle repo selection
  const handleSelectRepo = (repo: Repository) => {
    setSelectedRepo(repo)
    setAppName(repo.displayName)
  }

  // Proceed to step 2
  const handleNextStep = () => {
    if (parsedCompose) {
      initializeServices(parsedCompose.services)
    }
    setStep('configure-services')
  }

  // Update service config
  const updateService = (index: number, updates: Partial<ServiceConfig>) => {
    setServices((prev) => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)))
  }

  // Create app
  const handleCreateApp = async () => {
    if (!selectedRepo || !parsedCompose) return

    try {
      const result = await createApp.mutateAsync({
        name: appName,
        repositoryId: selectedRepo.id,
        branch,
        composeFile: parsedCompose.file,
        autoDeployEnabled,
        services: services.map((s) => ({
          serviceName: s.serviceName,
          containerPort: s.containerPort ?? undefined,
          exposed: s.exposed,
          domain: s.domain || undefined,
        })),
      })

      navigate({ to: '/apps/$appId', params: { appId: result.id } })
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
        <Link to="/apps" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
          <span className="text-sm">Apps</span>
        </Link>
        <div className="flex-1" />
        <div className="text-sm text-muted-foreground">
          Step {step === 'select-repo' ? '1' : '2'} of 2
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {step === 'select-repo' ? (
          <div className="mx-auto max-w-2xl">
            <Card>
              <CardHeader>
                <CardTitle>Select Repository</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                    placeholder="Search repositories..."
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
                        No repositories found
                      </p>
                    )}
                  </div>
                )}

                {/* Selected repo compose status */}
                {selectedRepo && (
                  <div className="rounded-lg border bg-muted/50 p-4">
                    {composeLoading || parseLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="animate-spin" />
                        <span className="text-sm">Checking for compose file...</span>
                      </div>
                    ) : composeError ? (
                      <div className="flex items-center gap-2 text-destructive">
                        <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} />
                        <span className="text-sm">Error: {composeError.message}</span>
                      </div>
                    ) : composeInfo?.found ? (
                      <div className="flex items-center gap-2 text-green-600">
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={2} />
                        <span className="text-sm">
                          Found {composeInfo.file}
                          {parsedCompose && ` with ${parsedCompose.services.length} service(s)`}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-destructive">
                        <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
                        <span className="text-sm">No compose file found in this repository</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2">
                  <Link to="/apps">
                    <Button variant="outline">Cancel</Button>
                  </Link>
                  <Button
                    onClick={handleNextStep}
                    disabled={!selectedRepo || !composeInfo?.found || !parsedCompose}
                  >
                    Next
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
                <CardTitle>Configure App</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {selectedRepo?.displayName} · {parsedCompose?.file}
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* App name */}
                <div className="space-y-2">
                  <Label htmlFor="appName">App Name</Label>
                  <Input
                    id="appName"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    placeholder="my-app"
                  />
                </div>

                {/* Branch */}
                <div className="space-y-2">
                  <Label htmlFor="branch">Branch</Label>
                  <Input
                    id="branch"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="main"
                  />
                </div>

                {/* Services */}
                <div className="space-y-4">
                  <Label>Services</Label>
                  <div className="space-y-3">
                    {services.map((service, index) => (
                      <div key={service.serviceName} className="rounded-lg border p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{service.serviceName}</span>
                            {service.containerPort && (
                              <Badge variant="secondary">:{service.containerPort}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`expose-${index}`}
                              checked={service.exposed}
                              onCheckedChange={(checked) =>
                                updateService(index, { exposed: checked === true })
                              }
                            />
                            <Label htmlFor={`expose-${index}`} className="text-sm">
                              Expose
                            </Label>
                          </div>
                        </div>

                        {service.exposed && (
                          <div className="space-y-2">
                            <Label htmlFor={`domain-${index}`} className="text-sm">
                              Domain
                            </Label>
                            <Input
                              id={`domain-${index}`}
                              value={service.domain}
                              onChange={(e) => updateService(index, { domain: e.target.value })}
                              placeholder="app.example.com"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Auto deploy */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="autoDeployEnabled"
                    checked={autoDeployEnabled}
                    onCheckedChange={(checked) => setAutoDeployEnabled(checked === true)}
                  />
                  <Label htmlFor="autoDeployEnabled">Auto-deploy on push to {branch}</Label>
                </div>

                {/* Actions */}
                <div className="flex justify-between gap-2">
                  <Button variant="outline" onClick={() => setStep('select-repo')}>
                    <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
                    Back
                  </Button>
                  <Button
                    onClick={handleCreateApp}
                    disabled={!appName || createApp.isPending}
                  >
                    {createApp.isPending ? (
                      <>
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          size={16}
                          strokeWidth={2}
                          className="animate-spin"
                        />
                        Creating...
                      </>
                    ) : (
                      'Create App'
                    )}
                  </Button>
                </div>

                {createApp.error && (
                  <div className="flex items-center gap-2 text-destructive">
                    <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} />
                    <span className="text-sm">{createApp.error.message}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
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
