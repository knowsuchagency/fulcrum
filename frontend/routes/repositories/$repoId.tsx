import { useState, useCallback, useEffect } from 'react'
import { createFileRoute, Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useRepository, useUpdateRepository } from '@/hooks/use-repositories'
import { useAppByRepository, useFindCompose } from '@/hooks/use-apps'
import { useProjects } from '@/hooks/use-projects'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  Loading03Icon,
  Alert02Icon,
  Folder01Icon,
  Settings05Icon,
  Tick02Icon,
  GridIcon,
  RocketIcon,
  Add01Icon,
} from '@hugeicons/core-free-icons'
import { AGENT_DISPLAY_NAMES, type AgentType } from '@/types'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { WorkspacePanel } from '@/components/workspace/workspace-panel'
import { DeploymentsTab } from '@/components/apps/deployments-tab'
import { DeploymentSetupWizard } from '@/components/apps/deployment-setup-wizard'
import { useDeploymentStore } from '@/stores/hooks/use-deployment-store'
import { useDeploymentPrerequisites } from '@/hooks/use-apps'
import { observer } from 'mobx-react-lite'

type RepoTab = 'settings' | 'workspace' | 'deploy'

interface RepoSearchParams {
  tab?: RepoTab
  file?: string
}

const RepositoryDetailView = observer(function RepositoryDetailView() {
  const { t } = useTranslation('repositories')
  const navigate = useNavigate()
  const { repoId } = useParams({ from: '/repositories/$repoId' })
  const searchParams = useSearch({ from: '/repositories/$repoId' }) as RepoSearchParams
  const { data: repository, isLoading, error } = useRepository(repoId)
  const updateRepository = useUpdateRepository()
  const app = useAppByRepository(repoId)
  const deployStore = useDeploymentStore()
  const { data: prereqs } = useDeploymentPrerequisites()
  const { data: composeInfo } = useFindCompose(repoId)
  const { data: projects } = useProjects()

  // Redirect to project detail if this repo belongs to a project
  useEffect(() => {
    if (projects) {
      const project = projects.find(
        (p) => p.repository?.id === repoId ||
               p.repositories.some((r) => r.id === repoId)
      )
      if (project) {
        navigate({
          to: '/projects/$projectId',
          params: { projectId: project.id },
          replace: true,
        })
      }
    }
  }, [projects, repoId, navigate])

  // Tab state from URL
  const activeTab = searchParams.tab ?? 'settings'

  // Settings state
  const [displayName, setDisplayName] = useState('')
  const [startupScript, setStartupScript] = useState('')
  const [copyFiles, setCopyFiles] = useState('')
  const [defaultAgent, setDefaultAgent] = useState<AgentType | 'default'>('default')
  const [hasChanges, setHasChanges] = useState(false)

  // Initialize form state when repository loads
  if (repository && !hasChanges) {
    if (displayName !== repository.displayName) setDisplayName(repository.displayName)
    if (startupScript !== (repository.startupScript || '')) setStartupScript(repository.startupScript || '')
    if (copyFiles !== (repository.copyFiles || '')) setCopyFiles(repository.copyFiles || '')
    if (defaultAgent !== (repository.defaultAgent || 'default')) setDefaultAgent(repository.defaultAgent || 'default')
  }

  const handleTabChange = useCallback(
    (newTab: string) => {
      navigate({
        to: '/repositories/$repoId',
        params: { repoId },
        search: { tab: newTab !== 'settings' ? (newTab as RepoTab) : undefined },
        replace: true,
      })
    },
    [navigate, repoId]
  )

  const handleFileChange = useCallback(
    (file: string | null) => {
      navigate({
        to: '/repositories/$repoId',
        params: { repoId },
        search: { tab: activeTab !== 'settings' ? (activeTab as RepoTab) : undefined, file: file ?? undefined },
        replace: true,
      })
    },
    [navigate, repoId, activeTab]
  )

  const handleSaveSettings = async () => {
    if (!repository) return
    try {
      await updateRepository.mutateAsync({
        id: repository.id,
        updates: {
          displayName,
          startupScript: startupScript || null,
          copyFiles: copyFiles || null,
          defaultAgent: defaultAgent === 'default' ? null : defaultAgent,
        },
      })
      toast.success(t('detailView.saved'))
      setHasChanges(false)
    } catch (err) {
      toast.error(t('detailView.failedToSave'), {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  const handleDeploy = useCallback(() => {
    if (!app) return
    deployStore.deploy(app.id)
  }, [app, deployStore])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <HugeiconsIcon icon={Loading03Icon} size={24} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !repository) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <HugeiconsIcon icon={Alert02Icon} size={24} className="text-destructive" />
        <p className="text-sm text-muted-foreground">{t('detailView.notFound')}</p>
        <Link to="/repositories">
          <Button variant="outline" size="sm">
            {t('detailView.breadcrumb')}
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
        <Link to="/repositories">
          <Button variant="ghost" size="sm">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} data-slot="icon" />
            <span className="max-sm:hidden">{t('detailView.breadcrumb')}</span>
          </Button>
        </Link>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Folder01Icon} size={14} className="text-muted-foreground" />
          <span className="text-sm font-mono text-muted-foreground truncate max-w-xs">
            {repository.path}
          </span>
        </div>
      </div>

      {/* Title */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-3">
        <h1 className="text-lg font-semibold">{repository.displayName}</h1>
        <span className="text-sm text-muted-foreground">(Standalone Repository)</span>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col">
        <TabsList className="shrink-0 mx-4 mt-2">
          <TabsTrigger value="settings" className="gap-1.5">
            <HugeiconsIcon icon={Settings05Icon} size={14} />
            {t('settings')}
          </TabsTrigger>
          <TabsTrigger value="workspace" className="gap-1.5">
            <HugeiconsIcon icon={GridIcon} size={14} />
            {t('detailView.tabs.workspace')}
          </TabsTrigger>
          <TabsTrigger value="deploy" className="gap-1.5">
            <HugeiconsIcon icon={RocketIcon} size={14} />
            Deploy
          </TabsTrigger>
        </TabsList>

        {/* Settings Tab */}
        <TabsContent value="settings" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="max-w-2xl px-6 py-6 space-y-8">
              <FieldGroup>
                <Field>
                  <FieldLabel>{t('detailView.settings.displayName')}</FieldLabel>
                  <FieldDescription>Name shown in the UI</FieldDescription>
                  <Input
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value)
                      setHasChanges(true)
                    }}
                    placeholder="Repository name"
                  />
                </Field>
              </FieldGroup>

              <FieldGroup>
                <Field>
                  <FieldLabel>{t('detailView.settings.startupScript')}</FieldLabel>
                  <FieldDescription>
                    {t('detailView.settings.startupScriptDescription')}
                  </FieldDescription>
                  <Textarea
                    value={startupScript}
                    onChange={(e) => {
                      setStartupScript(e.target.value)
                      setHasChanges(true)
                    }}
                    placeholder={t('detailView.settings.startupScriptPlaceholder')}
                    className="font-mono text-sm"
                    rows={3}
                  />
                </Field>

                <Field>
                  <FieldLabel>{t('detailView.settings.copyFiles')}</FieldLabel>
                  <FieldDescription>
                    {t('detailView.settings.copyFilesDescription')}
                  </FieldDescription>
                  <Input
                    value={copyFiles}
                    onChange={(e) => {
                      setCopyFiles(e.target.value)
                      setHasChanges(true)
                    }}
                    placeholder={t('detailView.settings.copyFilesPlaceholder')}
                    className="font-mono text-sm"
                  />
                </Field>
              </FieldGroup>

              <FieldGroup>
                <Field>
                  <FieldLabel>{t('detailView.settings.defaultAgent')}</FieldLabel>
                  <FieldDescription>
                    {t('detailView.settings.defaultAgentDescription')}
                  </FieldDescription>
                  <Select
                    value={defaultAgent}
                    onValueChange={(value) => {
                      if (value) {
                        setDefaultAgent(value as AgentType | 'default')
                        setHasChanges(true)
                      }
                    }}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">{t('detailView.settings.defaultAgentInherit')}</SelectItem>
                      {Object.entries(AGENT_DISPLAY_NAMES).map(([key, name]) => (
                        <SelectItem key={key} value={key}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>

              {/* Save button */}
              {hasChanges && (
                <div className="flex justify-end">
                  <Button onClick={handleSaveSettings} disabled={updateRepository.isPending}>
                    {updateRepository.isPending ? (
                      <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" data-slot="icon" />
                    ) : (
                      <HugeiconsIcon icon={Tick02Icon} size={14} data-slot="icon" />
                    )}
                    {t('detailView.save')}
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Workspace Tab */}
        <TabsContent value="workspace" className="flex-1 overflow-hidden mt-0">
          <WorkspacePanel
            repoPath={repository.path}
            repoDisplayName={repository.displayName}
            activeTab={activeTab}
            file={searchParams.file}
            onFileChange={handleFileChange}
          />
        </TabsContent>

        {/* Deploy Tab */}
        <TabsContent value="deploy" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="px-6 py-6 space-y-6">
              {/* Check if deployment prerequisites are met */}
              {prereqs && !prereqs.ready ? (
                <DeploymentSetupWizard />
              ) : app ? (
                /* App exists - show deploy controls and history */
                <div className="space-y-6">
                  {/* App info header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{app.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        Branch: {app.branch} • Status: {app.status}
                      </p>
                    </div>
                    <Button onClick={handleDeploy} disabled={deployStore.isDeploying}>
                      {deployStore.isDeploying ? (
                        <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" data-slot="icon" />
                      ) : (
                        <HugeiconsIcon icon={RocketIcon} size={14} data-slot="icon" />
                      )}
                      Deploy
                    </Button>
                  </div>

                  {/* Deployments history */}
                  <DeploymentsTab
                    appId={app.id}
                    deployStore={deployStore}
                    onViewStreamingLogs={() => {}}
                  />
                </div>
              ) : (
                /* No app - show create option */
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <HugeiconsIcon icon={RocketIcon} size={48} className="text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No App Configured</h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-md">
                    {composeInfo?.found
                      ? 'This repository has a Docker Compose file. Create an app to deploy it.'
                      : 'To deploy this repository, create a docker-compose.yml file first.'}
                  </p>
                  {composeInfo?.found ? (
                    <Link to="/apps/new" search={{ repoId }}>
                      <Button>
                        <HugeiconsIcon icon={Add01Icon} size={14} data-slot="icon" />
                        {t('createApp')}
                      </Button>
                    </Link>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      <p>Create a <code className="bg-muted px-1.5 py-0.5 rounded">docker-compose.yml</code> file in your repository to enable deployment.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
})

export const Route = createFileRoute('/repositories/$repoId')({
  validateSearch: (search: Record<string, unknown>): RepoSearchParams => ({
    tab: ['settings', 'workspace', 'deploy'].includes(search.tab as string)
      ? (search.tab as RepoTab)
      : undefined,
    file: typeof search.file === 'string' ? search.file : undefined,
  }),
  component: RepositoryDetailView,
})
