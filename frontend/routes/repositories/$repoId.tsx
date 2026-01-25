import { useState, useCallback, useRef, useEffect } from 'react'
import { createFileRoute, Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { observer } from 'mobx-react-lite'
import { useQueryClient } from '@tanstack/react-query'
import { useRepository, useDeleteRepository } from '@/hooks/use-repositories'
import {
  useAppByRepository,
  useFindCompose,
  useStopApp,
  useCancelDeployment,
  useDeploymentPrerequisites,
} from '@/hooks/use-apps'
import { useDeploymentStore, DeploymentStoreProvider } from '@/stores/hooks/use-deployment-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
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
  ArrowLeft01Icon,
  Menu01Icon,
  Rocket01Icon,
  TextIcon,
  Chart02Icon,
  WindowsOldIcon,
  Settings05Icon,
  PackageAddIcon,
  PackageIcon,
} from '@hugeicons/core-free-icons'
import { WorkspacePanel } from '@/components/workspace/workspace-panel'
import { DeploymentSetupWizard } from '@/components/apps/deployment-setup-wizard'
import { RepositorySettingsTab } from '@/components/repository/repository-settings-tab'
import { DeployControls } from '@/components/repository/deploy-controls'
import { ServicesConfig } from '@/components/repository/services-config'
import { EnvironmentConfig } from '@/components/repository/environment-config'
import { ComposeEditor } from '@/components/repository/compose-editor'
import { StreamingLogsModal } from '@/components/repository/streaming-logs-modal'
import { DeploymentsTab } from '@/components/apps/deployments-tab'
import { LogsTab } from '@/components/apps/logs-tab'
import { MonitoringTab } from '@/components/apps/monitoring-tab'
import { CreateTaskModal } from '@/components/kanban/create-task-modal'
import { useEditorApp, useEditorHost, useEditorSshPort } from '@/hooks/use-config'
import { buildEditorUrl, openExternalUrl } from '@/lib/editor-url'
import { GitStatusBadge } from '@/components/viewer/git-status-badge'
import { VisualStudioCodeIcon, TaskAdd01Icon } from '@hugeicons/core-free-icons'
import { useCreateAppForRepository } from '@/hooks/use-apps'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

type RepoTab = 'settings' | 'workspace' | 'deploy'
type DeploySubTab = 'general' | 'deployments' | 'logs' | 'monitoring'

interface RepoSearchParams {
  tab?: RepoTab
  subtab?: DeploySubTab
  action?: 'deploy'
  file?: string
}

const RepositoryDetailView = observer(function RepositoryDetailView() {
  const { t } = useTranslation('repositories')
  const tProjects = useTranslation('projects').t
  const tCommon = useTranslation('common').t
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { repoId } = useParams({ from: '/repositories/$repoId' })
  const searchParams = useSearch({ from: '/repositories/$repoId' }) as RepoSearchParams
  const { data: repository, isLoading, error } = useRepository(repoId)
  const app = useAppByRepository(repoId)
  const deployStore = useDeploymentStore()
  const { data: prereqs } = useDeploymentPrerequisites()
  const { data: composeInfo, isLoading: composeLoading } = useFindCompose(repoId)
  const stopApp = useStopApp()
  const cancelDeployment = useCancelDeployment()
  const deleteRepository = useDeleteRepository()
  const createAppForRepository = useCreateAppForRepository()

  // Tab state from URL
  const activeTab = searchParams.tab ?? 'settings'
  const activeSubtab: DeploySubTab | null = activeTab === 'deploy' ? (searchParams.subtab || 'general') : null

  // UI state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteDirectory, setDeleteDirectory] = useState(false)
  const [deleteApp, setDeleteApp] = useState(false)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState('')
  const [showStreamingLogs, setShowStreamingLogs] = useState(false)
  const [composeWarningOpen, setComposeWarningOpen] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const actionConsumedRef = useRef(false)

  const isBuilding = deployStore.isDeploying || app?.status === 'building'
  const isRunning = app?.status === 'running'
  const hasApp = !!app
  const showDnsWarning = prereqs && !prereqs.settings.cloudflareConfigured

  const { data: editorApp } = useEditorApp()
  const { data: editorHost } = useEditorHost()
  const { data: editorSshPort } = useEditorSshPort()

  // Handle auto-deploy action from URL
  const [pendingDeployAppId, setPendingDeployAppId] = useState<string | null>(null)

  // Capture deploy intent when action param is present
  useEffect(() => {
    if (searchParams.action === 'deploy' && app && !actionConsumedRef.current) {
      actionConsumedRef.current = true
      setPendingDeployAppId(app.id)
      // Clean up the URL
      const search: RepoSearchParams = {}
      if (searchParams.tab) search.tab = searchParams.tab
      if (searchParams.subtab) search.subtab = searchParams.subtab
      navigate({
        to: '/repositories/$repoId',
        params: { repoId },
        search,
        replace: true,
      })
    }
  }, [searchParams.action, app, repoId, navigate, searchParams.tab, searchParams.subtab])

  // Execute the pending deploy - this mimics handleDeploy exactly
  useEffect(() => {
    if (pendingDeployAppId) {
      const appIdToDeploy = pendingDeployAppId
      setPendingDeployAppId(null)
      deployStore.deploy(appIdToDeploy)
      setShowStreamingLogs(true)
    }
  }, [pendingDeployAppId, deployStore])

  useEffect(() => {
    actionConsumedRef.current = false
  }, [repoId])

  const handleOpenEditor = () => {
    if (!repository?.path) return
    const url = buildEditorUrl(repository.path, editorApp, editorHost, editorSshPort)
    openExternalUrl(url)
  }

  const handleDeploy = useCallback(() => {
    if (app) {
      deployStore.deploy(app.id)
      setShowStreamingLogs(true)
    }
  }, [app, deployStore])

  const handleStop = async () => {
    if (!app) return
    await stopApp.mutateAsync(app.id)
  }

  const handleCancelDeploy = async () => {
    if (!app) return
    await cancelDeployment.mutateAsync(app.id)
  }

  const handleStreamingLogsClose = useCallback(
    (open: boolean) => {
      setShowStreamingLogs(open)
      if (!open && !deployStore.isDeploying && deployStore.logs.length === 0 && !deployStore.error) {
        setTimeout(() => deployStore.reset(), 300)
      }
    },
    [deployStore]
  )

  const handleStartEditName = useCallback(() => {
    if (repository) {
      setEditedName(repository.displayName)
      setIsEditingName(true)
      setTimeout(() => nameInputRef.current?.select(), 0)
    }
  }, [repository])

  const handleSaveName = useCallback(() => {
    // Name editing is handled by RepositorySettingsTab
    setIsEditingName(false)
    setEditedName('')
  }, [])

  const handleCancelEditName = useCallback(() => {
    setIsEditingName(false)
    setEditedName('')
  }, [])

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSaveName()
      } else if (e.key === 'Escape') {
        handleCancelEditName()
      }
    },
    [handleSaveName, handleCancelEditName]
  )

  const setActiveTab = useCallback(
    (newTab: RepoTab, newSubtab?: DeploySubTab) => {
      const search: RepoSearchParams = {}
      if (newTab !== 'settings') {
        search.tab = newTab
      }
      if (newTab === 'workspace' && searchParams.file) {
        search.file = searchParams.file
      }
      if (newTab === 'deploy' && newSubtab && newSubtab !== 'general') {
        search.subtab = newSubtab
      }
      navigate({
        to: '/repositories/$repoId',
        params: { repoId },
        search,
        replace: true,
      })
    },
    [navigate, repoId, searchParams.file]
  )

  const setActiveSubtab = useCallback(
    (newSubtab: DeploySubTab) => {
      setActiveTab('deploy', newSubtab)
    },
    [setActiveTab]
  )

  const handleFileChange = useCallback(
    (newFile: string | null) => {
      navigate({
        to: '/repositories/$repoId',
        params: { repoId },
        search: { tab: 'workspace', file: newFile ?? undefined },
        replace: true,
      })
    },
    [navigate, repoId]
  )

  const handleFileSaved = useCallback(
    (savedFile: string) => {
      if (repository?.path && app?.composeFile) {
        const composeFileName = app.composeFile
        if (savedFile === composeFileName || savedFile.endsWith(`/${composeFileName}`)) {
          queryClient.invalidateQueries({
            queryKey: ['compose', 'file', repository.path, app.composeFile],
          })
        }
      }
    },
    [repository?.path, app?.composeFile, queryClient]
  )

  const handleDelete = async () => {
    await deleteRepository.mutateAsync({
      id: repoId,
      deleteDirectory,
      deleteApp,
    })
    navigate({ to: '/repositories' })
  }

  const handleCreateApp = () => {
    if (composeLoading || createAppForRepository.isPending) return
    if (!composeInfo?.found) {
      setComposeWarningOpen(true)
    } else {
      createAppForRepository.mutate({
        repositoryId: repoId,
        composeFile: composeInfo.file ?? undefined,
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <HugeiconsIcon
          icon={Loading03Icon}
          size={24}
          strokeWidth={2}
          className="animate-spin text-muted-foreground"
        />
      </div>
    )
  }

  if (error || !repository) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <HugeiconsIcon icon={Alert02Icon} size={48} strokeWidth={1.5} className="text-destructive" />
        <p className="text-muted-foreground">{error?.message ?? t('detailView.notFound')}</p>
        <Link to="/repositories">
          <Button variant="outline">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
            {t('detailView.breadcrumb')}
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as RepoTab)}
        className="flex h-full flex-col"
      >
        {/* Header bar - tabs on left, repo info + actions on right */}
        <div className="film-grain relative flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-2" style={{ background: 'var(--gradient-header)' }}>
          {/* Mobile: hamburger menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 sm:hidden">
              <HugeiconsIcon icon={Menu01Icon} size={18} strokeWidth={2} />
              <span className="text-sm font-medium">
                {activeTab === 'deploy' && activeSubtab
                  ? `${tProjects('detailView.tabs.deploy')} > ${tProjects(`detailView.tabs.${activeSubtab === 'general' ? 'deployGeneral' : activeSubtab}`)}`
                  : activeTab === 'settings'
                    ? t('detailView.tabs.settings')
                    : t('detailView.tabs.workspace')}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setActiveTab('settings')} className="gap-2">
                <HugeiconsIcon icon={Settings05Icon} size={14} strokeWidth={2} />
                {t('detailView.tabs.settings')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab('workspace')} className="gap-2">
                <HugeiconsIcon icon={WindowsOldIcon} size={14} strokeWidth={2} />
                {t('detailView.tabs.workspace')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab('deploy', 'general')} className="gap-2">
                <HugeiconsIcon icon={Rocket01Icon} size={14} strokeWidth={2} />
                {tProjects('detailView.tabs.deploy')} &gt; {tProjects('detailView.tabs.deployGeneral')}
              </DropdownMenuItem>
              {hasApp && (
                <>
                  <DropdownMenuItem onClick={() => setActiveTab('deploy', 'deployments')} className="gap-2">
                    <HugeiconsIcon icon={Rocket01Icon} size={14} strokeWidth={2} />
                    {tProjects('detailView.tabs.deploy')} &gt; {tProjects('detailView.tabs.deployments')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab('deploy', 'logs')} className="gap-2">
                    <HugeiconsIcon icon={TextIcon} size={14} strokeWidth={2} />
                    {tProjects('detailView.tabs.deploy')} &gt; {tProjects('detailView.tabs.logs')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab('deploy', 'monitoring')} className="gap-2">
                    <HugeiconsIcon icon={Chart02Icon} size={14} strokeWidth={2} />
                    {tProjects('detailView.tabs.deploy')} &gt; {tProjects('detailView.tabs.monitoring')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Desktop: top-level tabs */}
          <TabsList variant="line" className="hidden sm:inline-flex">
            <TabsTrigger value="settings" className="gap-1.5 px-3 py-1.5">
              <HugeiconsIcon icon={Settings05Icon} size={14} strokeWidth={2} />
              {t('detailView.tabs.settings')}
            </TabsTrigger>
            <TabsTrigger value="workspace" className="gap-1.5 px-3 py-1.5">
              <HugeiconsIcon icon={WindowsOldIcon} size={14} strokeWidth={2} />
              {t('detailView.tabs.workspace')}
            </TabsTrigger>
            <TabsTrigger value="deploy" className="gap-1.5 px-3 py-1.5">
              <HugeiconsIcon icon={Rocket01Icon} size={14} strokeWidth={2} />
              {tProjects('detailView.tabs.deploy')}
            </TabsTrigger>
          </TabsList>

          {/* Right side: actions + repo info */}
          <div className="flex items-center gap-2">
            {/* Quick actions */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTaskModalOpen(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={TaskAdd01Icon} size={14} strokeWidth={2} data-slot="icon" />
              <span className="hidden sm:inline">{t('newTask')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenEditor}
              className="text-muted-foreground hover:text-foreground hidden sm:flex"
            >
              <HugeiconsIcon icon={VisualStudioCodeIcon} size={14} strokeWidth={2} data-slot="icon" />
            </Button>
            <div className="h-4 w-px bg-border mx-1" />

            {/* Repo info */}
            <GitStatusBadge worktreePath={repository.path} />
            {isEditingName ? (
              <Input
                ref={nameInputRef}
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={handleNameKeyDown}
                className="font-medium text-sm bg-transparent border-b border-primary outline-none px-0.5 min-w-[100px] h-auto py-0"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={handleStartEditName}
                className="font-medium text-sm hover:text-primary transition-colors cursor-pointer"
                title="Click to edit"
              >
                {repository.displayName}
              </button>
            )}
            {repository.projects && repository.projects.length > 0 && (
              <>
                <span className="text-muted-foreground/50 text-xs">in</span>
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: repository.projects[0].id }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <HugeiconsIcon icon={PackageIcon} size={12} strokeWidth={2} />
                  <span>{repository.projects[0].name}</span>
                </Link>
              </>
            )}
            {hasApp && (
              <div
                className={`h-2 w-2 rounded-full ${
                  app.status === 'running'
                    ? 'bg-green-500'
                    : app.status === 'building'
                      ? 'bg-yellow-500'
                      : app.status === 'failed'
                        ? 'bg-red-500'
                        : 'bg-gray-400'
                }`}
                title={app.status}
              />
            )}
            {showDnsWarning && hasApp && (
              <Tooltip>
                <TooltipTrigger className="p-1 text-amber-500 hover:text-amber-400 transition-colors">
                  <HugeiconsIcon icon={Alert02Icon} size={14} strokeWidth={2} />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-medium">{tCommon('apps.manualDnsRequired')}</p>
                  <p className="text-muted-foreground mt-1">{tCommon('apps.manualDnsRequiredDesc')}</p>
                </TooltipContent>
              </Tooltip>
            )}
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

        {/* Deploy sub-tabs (shown when Deploy is active) */}
        {activeTab === 'deploy' && (
          <div className="shrink-0 border-b border-border bg-muted/50 px-4 hidden sm:flex items-center">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setActiveSubtab('general')}
                className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeSubtab === 'general'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tProjects('detailView.tabs.deployGeneral')}
              </button>
              {hasApp && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveSubtab('deployments')}
                    className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                      activeSubtab === 'deployments'
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tProjects('detailView.tabs.deployments')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSubtab('logs')}
                    className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                      activeSubtab === 'logs'
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tProjects('detailView.tabs.logs')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSubtab('monitoring')}
                    className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                      activeSubtab === 'monitoring'
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tProjects('detailView.tabs.monitoring')}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className={`flex-1 overflow-auto ${activeTab === 'workspace' ? '' : ''}`}>
          <TabsContent value="settings" className="mt-0 h-full">
            <RepositorySettingsTab repository={repository} />
          </TabsContent>

          <TabsContent value="workspace" className="mt-0 h-full">
            <WorkspacePanel
              repoPath={repository.path}
              repoDisplayName={repository.displayName}
              activeTab={activeTab}
              file={searchParams.file}
              onFileChange={handleFileChange}
              onFileSaved={handleFileSaved}
            />
          </TabsContent>

          <TabsContent value="deploy" className="mt-0 h-full">
            <ScrollArea className="h-full">
              <div className="p-4">
                {/* Check if deployment prerequisites are met */}
                {prereqs && !prereqs.ready ? (
                  <DeploymentSetupWizard />
                ) : activeSubtab === 'general' ? (
                  app ? (
                    /* App exists - show app config */
                    <div className="space-y-4 max-w-4xl">
                      {/* Top row: Deploy + Services side by side */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <DeployControls
                          app={app}
                          onDeploy={handleDeploy}
                          onStop={handleStop}
                          onCancelDeploy={handleCancelDeploy}
                          isBuilding={isBuilding}
                          isRunning={isRunning ?? false}
                          isStopPending={stopApp.isPending}
                          isCancelPending={cancelDeployment.isPending}
                          deployStore={deployStore}
                        />
                        <ServicesConfig app={app} onDeploy={handleDeploy} />
                      </div>

                      {/* Environment section - full width */}
                      <EnvironmentConfig app={app} />

                      {/* Compose file editor */}
                      <ComposeEditor app={app} repoPath={repository.path} />
                    </div>
                  ) : (
                    /* No app - show create option */
                    <div className="max-w-2xl">
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold">{tProjects('detailView.app.title')}</h3>
                        <p className="text-sm text-muted-foreground">{tProjects('detailView.app.noApp')}</p>
                      </div>

                      <div className="border rounded-lg p-6 text-center">
                        <HugeiconsIcon
                          icon={Rocket01Icon}
                          size={32}
                          strokeWidth={1.5}
                          className="mx-auto text-muted-foreground mb-3"
                        />
                        <p className="text-sm text-muted-foreground mb-4">
                          {tProjects('detailView.app.configureDeploymentDescription')}
                        </p>
                        <Button onClick={handleCreateApp} disabled={composeLoading || createAppForRepository.isPending}>
                          <HugeiconsIcon icon={PackageAddIcon} size={16} strokeWidth={2} data-slot="icon" />
                          {createAppForRepository.isPending
                            ? tProjects('detailView.app.configuring')
                            : tProjects('detailView.app.configureDeployment')}
                        </Button>
                      </div>
                    </div>
                  )
                ) : hasApp && activeSubtab === 'deployments' ? (
                  <DeploymentsTab
                    appId={app.id}
                    deployStore={deployStore}
                    onViewStreamingLogs={() => setShowStreamingLogs(true)}
                  />
                ) : hasApp && activeSubtab === 'logs' ? (
                  <LogsTab appId={app.id} services={app.services} />
                ) : hasApp && activeSubtab === 'monitoring' ? (
                  <MonitoringTab appId={app.id} repoDisplayName={repository.displayName} />
                ) : null}
              </div>
            </ScrollArea>
          </TabsContent>
        </div>
      </Tabs>

      {/* Streaming deployment logs modal */}
      {app && (
        <StreamingLogsModal
          appId={app.id}
          open={showStreamingLogs}
          onOpenChange={handleStreamingLogsClose}
          deployStore={deployStore}
        />
      )}

      {/* Task modal */}
      <CreateTaskModal
        open={taskModalOpen}
        onOpenChange={setTaskModalOpen}
        defaultRepository={{
          id: repository.id,
          path: repository.path,
          displayName: repository.displayName,
          startupScript: repository.startupScript,
          copyFiles: repository.copyFiles,
          claudeOptions: repository.claudeOptions,
          opencodeOptions: repository.opencodeOptions,
          opencodeModel: repository.opencodeModel,
          defaultAgent: repository.defaultAgent,
        }}
        showTrigger={false}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete.description', { name: repository.displayName })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="deleteDirectory"
                checked={deleteDirectory}
                onCheckedChange={(checked) => setDeleteDirectory(checked === true)}
              />
              <label htmlFor="deleteDirectory" className="text-sm">
                {t('delete.alsoDeleteDirectory')}
              </label>
            </div>
            {app && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="deleteApp"
                  checked={deleteApp}
                  onCheckedChange={(checked) => setDeleteApp(checked === true)}
                />
                <label htmlFor="deleteApp" className="text-sm">
                  {tProjects('delete.alsoDeleteApp')}
                </label>
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('apps.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteRepository.isPending ? t('delete.deleting') : t('delete.button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Compose file warning dialog */}
      <Dialog open={composeWarningOpen} onOpenChange={setComposeWarningOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('createAppDialog.title')}</DialogTitle>
            <DialogDescription>{t('createAppDialog.description')}</DialogDescription>
          </DialogHeader>
          <p className="text-sm">{t('createAppDialog.instructions')}</p>
          <div className="flex justify-end">
            <Button onClick={() => setComposeWarningOpen(false)}>{t('createAppDialog.close')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
})

function RepositoryDetailViewWithProvider() {
  return (
    <DeploymentStoreProvider>
      <RepositoryDetailView />
    </DeploymentStoreProvider>
  )
}

export const Route = createFileRoute('/repositories/$repoId')({
  validateSearch: (search: Record<string, unknown>): RepoSearchParams => ({
    tab: ['settings', 'workspace', 'deploy'].includes(search.tab as string)
      ? (search.tab as RepoTab)
      : undefined,
    subtab: ['general', 'deployments', 'logs', 'monitoring'].includes(search.subtab as string)
      ? (search.subtab as DeploySubTab)
      : undefined,
    action: search.action === 'deploy' ? 'deploy' : undefined,
    file: typeof search.file === 'string' ? search.file : undefined,
  }),
  component: RepositoryDetailViewWithProvider,
})
